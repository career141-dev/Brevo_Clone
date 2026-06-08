import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import "dotenv/config";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function run() {
  console.log("Region:", process.env.AWS_REGION);
  console.log("Access Key:", process.env.AWS_ACCESS_KEY_ID ? "SET" : "UNSET");
  try {
    const res = await sesClient.send(new SendEmailCommand({
      Source: "test@career141.com",
      Destination: { ToAddresses: ["test@career141.com"] },
      ConfigurationSetName: "career141-tracking",
      Message: {
        Subject: { Data: "Test", Charset: "UTF-8" },
        Body: { Html: { Data: "<p>Test</p>", Charset: "UTF-8" } },
      },
    }));
    console.log("Success:", res);
  } catch (err) {
    console.error("SES Error:", err);
  }
}
run();
