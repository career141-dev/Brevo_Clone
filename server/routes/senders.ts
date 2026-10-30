import { Router } from "express";
import { GetSendQuotaCommand } from "@aws-sdk/client-ses";
import { prisma } from "../prisma.js";
import { sesClient } from "../lib/ses.js";

export const sendersRouter = Router();
const router = sendersRouter;

// ── Senders ─────────────────────────────────────────────────────────

router.get("/api/senders", async (_req, res) => {
  try {
    const senders = await prisma.sender.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
    res.json(senders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch senders" });
  }
});

router.post("/api/senders", async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    const newSender = await prisma.sender.create({
      data: { name, email },
    });
    res.status(201).json(newSender);
  } catch (err) {
    console.error("Create sender error:", err);
    res.status(500).json({ error: "Failed to create sender" });
  }
});

router.delete("/api/senders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid sender ID" });

    await prisma.sender.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete sender error:", err);
    res.status(500).json({ error: "Failed to delete sender" });
  }
});

router.post("/api/senders/status", async (req, res) => {
  try {
    const { identities } = req.body;
    if (!identities || !Array.isArray(identities)) return res.json({});
    
    // We want to check both the full email address AND the domain
    const domains = identities.map((id: string) => id.split("@")[1]).filter(Boolean);
    const allIdentities = Array.from(new Set([...identities, ...domains]));
    
    const { GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand } = await import("@aws-sdk/client-ses");
    
    const verifyRes = await sesClient.send(new GetIdentityVerificationAttributesCommand({ Identities: allIdentities }));
    const dkimRes = await sesClient.send(new GetIdentityDkimAttributesCommand({ Identities: allIdentities }));
    
    const result: Record<string, any> = {};
    for (const id of allIdentities) {
      const vStatus = verifyRes.VerificationAttributes?.[id]?.VerificationStatus || "Unverified";
      const dStatus = dkimRes.DkimAttributes?.[id]?.DkimVerificationStatus || "Unverified";
      const dEnabled = dkimRes.DkimAttributes?.[id]?.DkimEnabled || false;

      result[id] = {
        verificationStatus: vStatus,
        dkimStatus: dStatus,
        dkimEnabled: dEnabled,
      };
    }
    
    // For emails, fallback to their domain's status if the email itself is unverified
    for (const id of identities) {
      if (id.includes("@")) {
        const domain = id.split("@")[1];
        if (result[id].verificationStatus === "Unverified" && result[domain]?.verificationStatus === "Success") {
          result[id].verificationStatus = result[domain].verificationStatus;
        }
        if (result[id].dkimStatus === "Unverified" && result[domain]?.dkimStatus === "Success") {
          result[id].dkimStatus = result[domain].dkimStatus;
        }
        if (!result[id].dkimEnabled && result[domain]?.dkimEnabled) {
          result[id].dkimEnabled = result[domain].dkimEnabled;
        }
      }
    }
    
    res.json(result);
  } catch (err) {
    console.error("AWS SES Status Error:", err);
    res.status(500).json({ error: "Failed to fetch AWS status" });
  }
});

router.post("/api/senders/sync", async (_req, res) => {
  try {
    const { ListIdentitiesCommand } = await import("@aws-sdk/client-ses");

    let allEmails: string[] = [];
    let nextToken: string | undefined = undefined;

    do {
      const listRes: any = await sesClient.send(
        new ListIdentitiesCommand({
          IdentityType: "EmailAddress",
          MaxItems: 100,
          NextToken: nextToken,
        })
      );
      allEmails = allEmails.concat(listRes.Identities ?? []);
      nextToken = listRes.NextToken;
    } while (nextToken);

    let synced = 0;
    for (const email of allEmails) {
      const existing = await prisma.sender.findUnique({ where: { email } });
      if (!existing) {
        await prisma.sender.create({
          data: {
            name: email.split("@")[0] || "Unknown",
            email,
          }
        });
        synced++;
      }
    }

    res.json({ synced });
  } catch (err: any) {
    console.error("Sync senders error:", err);
    if (err.name === "AccessDenied" || err.Code === "AccessDenied" || err.message?.includes("AccessDenied") || err.message?.includes("not authorized to perform: ses:ListIdentities")) {
      return res.status(403).json({ error: "AWS IAM Permission Denied", detail: "Missing ses:ListIdentities permission." });
    }
    res.status(500).json({ error: "Failed to sync senders", detail: err.message });
  }
});

router.get("/api/senders/quota", async (_req, res) => {
  try {
    const quota = await sesClient.send(new GetSendQuotaCommand({}));
    const max = quota.Max24HourSend ?? 0;
    const sent = quota.SentLast24Hours ?? 0;
    res.json({ max, sent, remaining: Math.max(0, max - sent) });
  } catch (err) {
    // If IAM user is missing ses:GetSendQuota permission, return a graceful fallback
    // rather than throwing a 500 internal server error.
    console.error("SES Quota Error:", err);
    res.status(403).json({ error: "Missing ses:GetSendQuota permission or AWS credentials invalid." });
  }
});

// ── Domains ─────────────────────────────────────────────────────────

// GET /api/domains — lists all domain identities from local DB
router.get("/api/domains", async (_req, res) => {
  try {
    const domains = await prisma.emailDomain.findMany({
      orderBy: { domain: "asc" }
    });
    res.json({ domains });
  } catch (err: any) {
    console.error("List domains error:", err);
    res.status(500).json({ error: "Failed to list domains", detail: err.message });
  }
});

router.post("/api/domains", async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "Domain is required" });

    const { VerifyDomainIdentityCommand, VerifyDomainDkimCommand } = await import("@aws-sdk/client-ses");
    await sesClient.send(new VerifyDomainIdentityCommand({ Domain: domain }));
    await sesClient.send(new VerifyDomainDkimCommand({ Domain: domain }));

    const newDomain = await prisma.emailDomain.upsert({
      where: { domain },
      update: {},
      create: { domain }
    });

    res.status(201).json(newDomain);
  } catch (err: any) {
    console.error("Add domain error:", err);
    res.status(500).json({ error: "Failed to add domain", detail: err.message });
  }
});

router.delete("/api/domains/:domain", async (req, res) => {
  try {
    const domain = req.params.domain;
    await prisma.emailDomain.delete({ where: { domain } });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete domain error:", err);
    res.status(500).json({ error: "Failed to delete domain", detail: err.message });
  }
});

router.post("/api/domains/sync", async (_req, res) => {
  try {
    const {
      ListIdentitiesCommand,
      GetIdentityVerificationAttributesCommand,
      GetIdentityDkimAttributesCommand,
    } = await import("@aws-sdk/client-ses");

    // Paginate through all domain identities in SES
    let allDomains: string[] = [];
    let nextToken: string | undefined = undefined;

    do {
      const listRes: any = await sesClient.send(
        new ListIdentitiesCommand({
          IdentityType: "Domain",
          MaxItems: 100,
          NextToken: nextToken,
        })
      );
      allDomains = allDomains.concat(listRes.Identities ?? []);
      nextToken = listRes.NextToken;
    } while (nextToken);

    if (allDomains.length > 0) {
      const chunkSize = 100;
      const verifyMap: Record<string, any> = {};
      const dkimMap: Record<string, any> = {};

      for (let i = 0; i < allDomains.length; i += chunkSize) {
        const chunk = allDomains.slice(i, i + chunkSize);
        const [vRes, dRes] = await Promise.all([
          sesClient.send(new GetIdentityVerificationAttributesCommand({ Identities: chunk })),
          sesClient.send(new GetIdentityDkimAttributesCommand({ Identities: chunk })),
        ]);
        Object.assign(verifyMap, vRes.VerificationAttributes ?? {});
        Object.assign(dkimMap, dRes.DkimAttributes ?? {});
      }

      for (const domain of allDomains) {
        await prisma.emailDomain.upsert({
          where: { domain },
          update: {
            verificationStatus: verifyMap[domain]?.VerificationStatus ?? "Unverified",
            dkimStatus: dkimMap[domain]?.DkimVerificationStatus ?? "Unverified",
            dkimEnabled: dkimMap[domain]?.DkimEnabled ?? false,
          },
          create: {
            domain,
            verificationStatus: verifyMap[domain]?.VerificationStatus ?? "Unverified",
            dkimStatus: dkimMap[domain]?.DkimVerificationStatus ?? "Unverified",
            dkimEnabled: dkimMap[domain]?.DkimEnabled ?? false,
          }
        });
      }
    }

    res.json({ synced: allDomains.length });
  } catch (err: any) {
    console.error("Sync domains error:", err);
    if (err.name === "AccessDenied" || err.Code === "AccessDenied" || err.message?.includes("AccessDenied")) {
      return res.status(403).json({ error: "AWS IAM Permission Denied", detail: "Missing ses:ListIdentities or ses:GetIdentityVerificationAttributes permissions." });
    }
    res.status(500).json({ error: "Failed to sync domains", detail: err.message });
  }
});

// GET /api/senders/aws-identities — lists all EMAIL identities registered in AWS SES
router.get("/api/senders/aws-identities", async (_req, res) => {
  try {
    const {
      ListIdentitiesCommand,
      GetIdentityVerificationAttributesCommand,
      GetIdentityDkimAttributesCommand,
    } = await import("@aws-sdk/client-ses");

    let allEmails: string[] = [];
    let nextToken: string | undefined = undefined;

    do {
      const listRes: any = await sesClient.send(
        new ListIdentitiesCommand({
          IdentityType: "EmailAddress",
          MaxItems: 100,
          NextToken: nextToken,
        })
      );
      allEmails = allEmails.concat(listRes.Identities ?? []);
      nextToken = listRes.NextToken;
    } while (nextToken);

    if (allEmails.length === 0) {
      return res.json({ identities: [] });
    }

    const chunkSize = 100;
    const verifyMap: Record<string, any> = {};
    const dkimMap: Record<string, any> = {};

    for (let i = 0; i < allEmails.length; i += chunkSize) {
      const chunk = allEmails.slice(i, i + chunkSize);
      const [vRes, dRes] = await Promise.all([
        sesClient.send(new GetIdentityVerificationAttributesCommand({ Identities: chunk })),
        sesClient.send(new GetIdentityDkimAttributesCommand({ Identities: chunk })),
      ]);
      Object.assign(verifyMap, vRes.VerificationAttributes ?? {});
      Object.assign(dkimMap, dRes.DkimAttributes ?? {});
    }

    const identities = allEmails.map((email) => ({
      email,
      verificationStatus: verifyMap[email]?.VerificationStatus ?? "Unverified",
      dkimStatus: dkimMap[email]?.DkimVerificationStatus ?? "Unverified",
      dkimEnabled: dkimMap[email]?.DkimEnabled ?? false,
    }));

    res.json({ identities });
  } catch (err: any) {
    console.error("List SES email identities error:", err);
    res.status(500).json({ error: "Failed to list SES email identities", detail: err.message });
  }
});

router.get("/api/domains/dns-records", async (req, res) => {
  try {
    const domain = req.query.domain as string;
    if (!domain) {
      return res.status(400).json({ error: "Missing domain parameter" });
    }

    const { VerifyDomainIdentityCommand, VerifyDomainDkimCommand } = await import("@aws-sdk/client-ses");

    // Initiate verification in platform's SES
    const identityRes = await sesClient.send(new VerifyDomainIdentityCommand({ Domain: domain }));
    const dkimRes = await sesClient.send(new VerifyDomainDkimCommand({ Domain: domain }));

    const verificationToken = identityRes.VerificationToken;
    const dkimTokens = dkimRes.DkimTokens || [];

    if (!verificationToken || dkimTokens.length === 0) {
      throw new Error("Failed to get verification tokens from SES");
    }

    const records: { type: string; name: string; value: string }[] = [];

    // TXT record for SES Identity
    records.push({
      type: "TXT",
      name: `_amazonses.${domain}`,
      value: verificationToken,
    });

    // CNAME records for DKIM
    for (const token of dkimTokens) {
      records.push({
        type: "CNAME",
        name: `${token}._domainkey.${domain}`,
        value: `${token}.dkim.amazonses.com`,
      });
    }

    res.json({ records });
  } catch (err: any) {
    console.error("Fetch DNS Records Error:", err);
    if (err.name === "AccessDenied" || err.Code === "AccessDenied" || err.message?.includes("AccessDenied")) {
      return res.status(403).json({ 
        error: "AWS IAM Permission Denied", 
        detail: "Your AWS IAM user does not have permission to verify domains. Please add 'ses:VerifyDomainIdentity' and 'ses:VerifyDomainDkim' permissions to the 'career141User' in AWS IAM." 
      });
    }
    res.status(500).json({ error: "Failed to fetch DNS records", detail: err.message });
  }
});
