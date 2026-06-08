import "dotenv/config";
import { GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { sesClient } from './server/lib/ses.js';
async function run() {
  try {
    const quota = await sesClient.send(new GetSendQuotaCommand({}));
    console.log("Quota:", quota);
  } catch (e) {
    console.error("AWS Error:", e);
  }
}
run();
