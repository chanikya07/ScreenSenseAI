# n8n Import Quick Reference

## 🎯 Which File to Use

| File | Purpose | Use For |
|------|---------|---------|
| **✅ n8n-bedrock-workflow.json** | Actual n8n workflow | **IMPORT INTO n8n** |
| **📋 n8n-credentials-template.json** | Credential reference | Set up credentials in n8n UI |
| **📚 n8n-bedrock-config.json** | Configuration reference | Documentation only (do not import) |
| **📖 N8N_BEDROCK_SETUP.md** | Complete setup guide | Follow step-by-step |

## ⚡ Quick Start

### Step 1: Import Workflow
```
In n8n UI:
1. Click "Workflows" → "+ New"
2. Click "Menu" → "Import from file"
3. Select: n8n-bedrock-workflow.json
4. Click "Import"
```

### Step 2: Add Credentials
```
In the imported workflow:
1. Click "AWS Bedrock Credentials" node
2. Click "Add Credentials" or select existing
3. Enter:
   - Access Key ID: YOUR_AWS_ACCESS_KEY_ID
   - Secret Access Key: YOUR_AWS_SECRET_ACCESS_KEY
   - Region: us-east-1

4. Click "Screen Sense Rotation Auth" node
5. Add header:
   - Key: x-rotation-secret
   - Value: YOUR_KEY_ROTATION_SECRET
```

### Step 3: Set Environment Variables
```powershell
$env:AWS_REGION = "us-east-1"
$env:AWS_ACCESS_KEY_ID = "YOUR_KEY"
$env:AWS_SECRET_ACCESS_KEY = "YOUR_SECRET"
$env:KEY_ROTATION_SECRET = "YOUR_SECRET"
$env:KEY_VAULT_ENDPOINT = "https://your-vault.example.com/api/keys"
$env:KEY_VAULT_TOKEN = "YOUR_TOKEN"
```

### Step 4: Test
```bash
# Validate workflow
node scripts/load-n8n-config.js --validate-workflow

# Test rotation endpoint (with app running)
node scripts/load-n8n-config.js --test-rotation

# Export environment variables
node scripts/load-n8n-config.js --export-env
```

## ❌ Why n8n Cannot Open n8n-bedrock-config.json

**Reason:** This file has a different structure than a workflow file
- Contains configuration, not workflow nodes
- Lacks `nodes` and `connections` arrays at top level
- Is a reference document, not an executable workflow

**Solution:** Use `n8n-bedrock-workflow.json` instead ✅

## 📝 Workflow Nodes

The imported workflow includes:

1. **Webhook Trigger** - Receives incoming requests from Screen Sense
2. **Check Rate Limit Error** - Detects HTTP 429 errors
3. **Query Key Vault** - Fetches next available API key
4. **Rotate to Next Key** - Updates rotation endpoint with new key
5. **Log Rotation Event** - Records rotation in audit log
6. **Invoke Bedrock Model** - Calls AWS Bedrock with rotated key
7. **Return Response** - Sends result back to requester

## 🔗 Connections Flow

```
Webhook → Check Error → [429?]
                        ├─ YES → Query Vault → Rotate → Log → Bedrock → Response
                        └─ NO → Direct to Bedrock → Response
```

## 🧪 Testing Commands

```bash
# Validate workflow structure
node scripts/load-n8n-config.js --validate-workflow

# List available Bedrock models
node scripts/load-n8n-config.js --list-models

# Show credential template
node scripts/load-n8n-config.js --export-credentials

# Test rotation endpoint
node scripts/load-n8n-config.js --test-rotation

# Export env vars to file
node scripts/load-n8n-config.js --export-env
```

## 🚀 After Import

1. Workflow is imported but **NOT active** yet
2. Configure credentials (see Step 2 above)
3. Click **"Save"** to persist
4. Click **"Activate"** to enable
5. Workflow will respond to requests at the webhook URL

## 📞 Support

If n8n still can't open the file:
1. Check JSON syntax: `node scripts/load-n8n-config.js --validate-workflow`
2. Ensure you're using **n8n-bedrock-workflow.json** (not the config file)
3. Try uploading via n8n web UI directly (drag & drop)
4. Check n8n version compatibility (requires v0.140+)
