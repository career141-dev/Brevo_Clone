import { SESv2Client } from '@aws-sdk/client-sesv2';
import { SESClient } from '@aws-sdk/client-ses';

if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error("AWS SES configuration is missing. Please check your environment variables: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.");
}

const clientConfig = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// SES v1 — used for quota checks and legacy operations
export const sesClient = new SESClient(clientConfig);

// SES v2 — used for sending emails with proper header support (List-Unsubscribe etc.)
export const sesv2Client = new SESv2Client(clientConfig);
