# n8n + AWS Bedrock + Screen Sense Key Rotation Setup

This guide shows how to connect your Screen Sense app with AWS Bedrock using n8n for automated API key rotation.

## Files Overview

- **`n8n-bedrock-workflow.json`** - Import this into n8n UI (the actual workflow)
- **`n8n-credentials-template.json`** - Reference for credentials to set up
- **`n8n-bedrock-config.json`** - Configuration reference (for documentation only, do not import)
- **`N8N_BEDROCK_SETUP.md`** - This guide

## Overview

The `n8n-bedrock-config.json` file contains:
- **n8n credentials** for AWS Bedrock and key rotation
- **Automation workflow** nodes and connections
- **API key pool management** with rotation policies
- **Environment variables** needed for deployment

## Prerequisites

1. **AWS Account** with Bedrock enabled
   - Region: `us-east-1` (or your preferred region)
   - IAM user with `bedrock:*` permissions

2. **n8n Instance** (self-hosted or cloud)
   - Running and accessible
   - API endpoint available

3. **Screen Sense App** running locally
   - Key rotation server at `http://127.0.0.1:8765` (from previous setup)
   - `KEY_ROTATION_SECRET` configured

## Step 1: Setup AWS Bedrock Credentials

### 1.1 Get AWS Access Keys
```powershell
# Create or retrieve your AWS IAM credentials
# Store securely in environment or AWS Secrets Manager
```

### 1.2 Update the JSON with Your AWS Keys
Replace in `n8n-bedrock-config.json`:
```json
"awsConfig": {
  "region": "us-east-1",
  "accessKeyId": "YOUR_AWS_ACCESS_KEY_ID",
  "secretAccessKey": "YOUR_AWS_SECRET_ACCESS_KEY"
}
```

## Step 2: Configure API Keys in the JSON

### 2.1 Update Provider Keys (OpenAI, Groq)
```json
"openaiProvider": {
  "data": {
    "apiKeys": [
      "sk-YOUR_FIRST_KEY",
      "sk-YOUR_SECOND_KEY",
      "sk-YOUR_BACKUP_KEY"
    ]
  }
}
```

### 2.2 Update Groq Keys
```json
"groqProvider": {
  "data": {
    "apiKeys": [
      "gsk_YOUR_FIRST_KEY",
      "gsk_YOUR_SECOND_KEY"
    ]
  }
}
```

## Step 3: Set Environment Variables

### 3.1 Windows PowerShell
```powershell
# Set for current session
$env:AWS_REGION = "us-east-1"
$env:AWS_ACCESS_KEY_ID = "YOUR_AWS_ACCESS_KEY_ID"
$env:AWS_SECRET_ACCESS_KEY = "YOUR_AWS_SECRET_ACCESS_KEY"
$env:KEY_ROTATION_SECRET = "YOUR_KEY_ROTATION_SECRET"
$env:KEY_VAULT_ENDPOINT = "https://your-key-vault.example.com/api/keys"
$env:KEY_VAULT_TOKEN = "YOUR_KEY_VAULT_TOKEN"
$env:N8N_WEBHOOK_URL = "http://your-n8n-instance.com/webhook/screen-sense-rotation"

# Or create a .env file and load it:
# (See .env.example below)
```

### 3.2 Create .env File
```bash
# .env (in root directory)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
KEY_ROTATION_SECRET=YOUR_KEY_ROTATION_SECRET
KEY_VAULT_ENDPOINT=https://your-key-vault.example.com/api/keys
KEY_VAULT_TOKEN=YOUR_KEY_VAULT_TOKEN
N8N_WEBHOOK_URL=http://your-n8n-instance.com/webhook/screen-sense-rotation
SCREEN_SENSE_APP_URL=http://127.0.0.1:8765
BEDROCK_RUNTIME_ENDPOINT=https://bedrock-runtime.us-east-1.amazonaws.com
```

## Step 4: Import Workflow into n8n

### 4.1 Via n8n UI (Recommended)
1. Open your n8n instance (http://localhost:5678)
2. Click **Workflows** tab
3. Click **+ New** button
4. Click **Menu** (top-left) → **Import from file**
5. Select **`n8n-bedrock-workflow.json`**
6. Click **Import**
7. The workflow nodes and connections will load automatically

### 4.2 Set Up Credentials in n8n
After importing the workflow:

1. Click on **AWS Bedrock Credentials** node
2. Click **Add Credentials** or select existing if available
3. Add your AWS credentials:
   - Access Key ID: `YOUR_AWS_ACCESS_KEY_ID`
   - Secret Access Key: `YOUR_AWS_SECRET_ACCESS_KEY`
   - Region: `us-east-1`
4. Click **Screen Sense Rotation Auth** node
5. Set the header:
   - Key: `x-rotation-secret`
   - Value: `YOUR_KEY_ROTATION_SECRET`
6. Save credentials

### 4.3 Via n8n API (Advanced)
```bash
# Import workflow
curl -X POST http://your-n8n-instance.com/api/v1/workflows \
  -H "Authorization: Bearer YOUR_N8N_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @n8n-bedrock-workflow.json

# Import credentials (requires enterprise)
curl -X POST http://your-n8n-instance.com/api/v1/credentials \
  -H "Authorization: Bearer YOUR_N8N_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @n8n-credentials-template.json
```

## Step 5: Configure Key Rotation Policies

Edit the `rotationRules` array to customize rotation behavior:

```json
"rotationRules": [
  {
    "provider": "openai",
    "trigger": "onErrorCode",
    "errorCode": 429,
    "action": "rotateThenRetry",
    "maxRetries": 3,
    "backoffMs": 5000
  },
  {
    "provider": "openai",
    "trigger": "onQuotaUsagePercent",
    "threshold": 80,
    "action": "proactiveRotate",
    "warnAt": 70
  }
]
```

**Trigger Types:**
- `onErrorCode`: Rotate when HTTP error (e.g., 429) is received
- `onQuotaUsagePercent`: Rotate when quota usage exceeds threshold
- `onSchedule`: Rotate on a cron schedule

**Actions:**
- `rotateThenRetry`: Rotate key and retry the request
- `proactiveRotate`: Rotate before quota exhaustion
- `rotateWeekly`: Rotate on a schedule

## Step 6: Test the Integration

### 6.1 Start Screen Sense App
```powershell
npm start
```

### 6.2 Trigger a Workflow in n8n
```bash
# Manually trigger the webhook
curl -X POST http://your-n8n-instance.com/webhook/screen-sense-rotation \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "provider": "openai"
  }'
```

### 6.3 Simulate Rate Limit Error
```bash
# Manually trigger key rotation with error simulation
node scripts/key-rotator.js \
  --secret=YOUR_KEY_ROTATION_SECRET \
  --openai="sk-NEW_KEY_1,sk-NEW_KEY_2" \
  --simulateError=429
```

### 6.4 Verify in Logs
- Check Screen Sense console for rotation messages
- Check n8n execution logs for workflow steps
- Review audit logs in `logs/key-rotation-audit.log`

## Step 7: Production Deployment

### 7.1 Secure Credential Storage
- Use **AWS Secrets Manager** instead of environment variables
- Use **n8n Vault** for credential encryption
- Rotate keys regularly (monthly recommended)

### 7.2 Enable Audit Logging
```json
"auditConfig": {
  "enabled": true,
  "logDestinations": [
    "cloudwatch",
    "datadog"
  ],
  "retention": "90days"
}
```

### 7.3 Set Up Monitoring & Alerts
- Monitor rotation frequency in CloudWatch
- Alert on consecutive failures (3+ retries)
- Alert on quota approaching threshold

## Workflow Execution Flow

```
1. Webhook Trigger (n8n receives request)
   ↓
2. Check Rate Limit Error (Is HTTP 429?)
   ├─ YES → Query Key Vault
   │   ↓
   │  Rotate to Next Key
   │   ↓
   │  Log Rotation Event
   │   ↓
   └─ NO → Direct to Bedrock
   ↓
3. Invoke Bedrock Model (AWS Bedrock call)
   ↓
4. Return Response (Success/Error)
```

## Troubleshooting

### Issue: "n8n cannot open the config file"
**Why this happens:**
- The `n8n-bedrock-config.json` file is a reference document, not a workflow file
- n8n requires a specific workflow JSON structure with `nodes` and `connections`

**Solution:**
✅ Use **`n8n-bedrock-workflow.json`** instead (this is the proper workflow file)
❌ Do NOT import `n8n-bedrock-config.json` directly

### Issue: "401 Unauthorized" from AWS
**Solution:** Verify AWS credentials and IAM permissions:
```bash
aws sts get-caller-identity
```

### Issue: "Key rotation endpoint not responding"
**Solution:** Ensure Screen Sense app is running:
```powershell
# Check if app is listening on 127.0.0.1:8765
netstat -ano | findstr :8765
```

### Issue: "n8n webhook not triggering"
**Solution:** Verify webhook URL and firewall:
```bash
curl http://your-n8n-instance.com/webhook/screen-sense-rotation
```

### Issue: Keys not rotating after rate limit
**Solution:** Check rotation logs:
```powershell
Get-Content logs/key-rotation-audit.log -Tail 20
```

## API Reference

### Rotate Keys Endpoint
```
POST http://127.0.0.1:8765/rotate-keys

Headers:
  x-rotation-secret: YOUR_SECRET
  Content-Type: application/json

Body:
{
  "openaiKey": "sk-NEW_KEY",
  "apiKey": "gsk-NEW_KEY"
}

Response:
{
  "success": true,
  "updated": ["openaiKey", "apiKey"],
  "timestamp": "2026-05-22T12:34:56Z"
}
```

### Query Key Pool
```
GET http://127.0.0.1:8765/key-pool

Response:
{
  "openai": {
    "active": 0,
    "keys": [...]
  },
  "groq": {
    "active": 0,
    "keys": [...]
  }
}
```

## Next Steps

1. **Deploy n8n** to a production environment
2. **Integrate with AWS Secrets Manager** for key storage
3. **Set up monitoring** with CloudWatch or Datadog
4. **Create additional workflows** for other AI models
5. **Document team runbooks** for emergency key rotation

## Security Best Practices

- ✅ Store credentials in AWS Secrets Manager
- ✅ Use IAM roles instead of access keys (when possible)
- ✅ Restrict n8n webhook to authorized IPs only
- ✅ Rotate the `KEY_ROTATION_SECRET` monthly
- ✅ Enable audit logging for compliance
- ✅ Use separate AWS accounts for dev/staging/prod
- ✅ Encrypt keys at rest and in transit
- ✅ Implement rate limiting on rotation endpoint

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review n8n documentation: https://docs.n8n.io
3. Review AWS Bedrock documentation: https://docs.aws.amazon.com/bedrock
4. Check app logs: `logs/key-rotation-audit.log`
