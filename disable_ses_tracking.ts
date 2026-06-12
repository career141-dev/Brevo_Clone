/**
 * Disables click & open tracking in the 'career141-tracking' SES Configuration Set.
 * This prevents AWS from double-wrapping app tracking URLs with awstrack.me redirects.
 * The config set is kept to receive bounce/complaint/delivery SNS webhooks.
 */
import { SESv2Client, UpdateConfigurationSetEventDestinationCommand, ListConfigurationSetsCommand, GetConfigurationSetEventDestinationsCommand } from "@aws-sdk/client-sesv2";
import "dotenv/config";

const client = new SESv2Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const CONFIG_SET_NAME = "career141-tracking";

async function main() {
  console.log(`Fetching event destinations for config set: ${CONFIG_SET_NAME}`);

  const destRes = await client.send(new GetConfigurationSetEventDestinationsCommand({
    ConfigurationSetName: CONFIG_SET_NAME,
  }));

  const destinations = destRes.EventDestinations ?? [];
  console.log(`Found ${destinations.length} event destination(s)`);

  for (const dest of destinations) {
    console.log(`\nEvent destination: "${dest.Name}"`);
    console.log("  Current matching event types:", dest.MatchingEventTypes);

    // Remove CLICK and OPEN from the matching event types — keep only BOUNCE, COMPLAINT, DELIVERY
    const cleaned = (dest.MatchingEventTypes ?? []).filter(
      (t) => !["CLICK", "OPEN"].includes(t)
    );

    console.log("  Updated matching event types:", cleaned);

    await client.send(new UpdateConfigurationSetEventDestinationCommand({
      ConfigurationSetName: CONFIG_SET_NAME,
      EventDestinationName: dest.Name!,
      EventDestination: {
        Enabled: dest.Enabled ?? true,
        MatchingEventTypes: cleaned as any,
        SnsDestination: dest.SnsDestination,
        KinesisFirehoseDestination: dest.KinesisFirehoseDestination,
        CloudWatchDestination: dest.CloudWatchDestination,
        PinpointDestination: dest.PinpointDestination,
        EventBridgeDestination: dest.EventBridgeDestination,
      },
    }));

    console.log("  ✅ Updated successfully — CLICK and OPEN tracking removed from SES config set.");
  }

  if (destinations.length === 0) {
    console.log("No event destinations found. Nothing to update.");
    console.log("If you see awstrack.me wrapping your links, check that click/open tracking");
    console.log("is not enabled at the configuration set level in the AWS SES console.");
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
