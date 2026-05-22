# Quick Start: Feedback Feature

## 🚀 5-Minute Setup

### Step 1: Launch ScreenSense
```bash
npm start
```

### Step 2: Open Feedback
- Click the **💬 Feedback** button in the panel footer
- Or click the **Feedback** mode card in the modes grid
- Or go to Settings → Feedback → "Open Feedback Window"

### Step 3: Submit Your First Feedback
1. Click **👍 Good** (rating)
2. Select **Live Captions** (optional)
3. Type: "Testing the feedback feature!"
4. Click **Submit Feedback**

### Step 4: View History
- Your feedback appears in the "Feedback History" panel
- Newest items appear first

### Step 5: Export
- Click **📊 CSV** to download as spreadsheet
- Click **📥 JSON** for raw data
- Click **📄 Markdown** for a formatted report

✅ **Done!** Files saved to your Downloads folder.

---

## 💡 Real-World Use Cases

### Use Case 1: Collect User Feedback
**Scenario:** You're testing ScreenSense with colleagues

1. **Collect feedback from each person:**
   - Have each person submit 1-2 ratings
   - Ask them to note specific observations

2. **Export as CSV:**
   - Click **📊 CSV**
   - Open in Excel/Google Sheets
   - Analyze satisfaction trends

### Use Case 2: Track Feature Performance
**Scenario:** You want to know which mode works best

**Approach:**
1. Use each mode for 5 minutes
2. Submit feedback for each mode
3. Export and see ratings by mode

**CSV will show:**
```
Timestamp, Mode, Rating, Comment
2024-01-19 15:30, live-captions, positive, "Very accurate!"
2024-01-19 15:35, scene-explain, neutral, "Misses some details"
2024-01-19 15:40, scene-explain, positive, "Got the diagram!"
```

### Use Case 3: Bug Reporting
**Scenario:** You found an issue in Scene Explainer

**Submit as:**
- Rating: **👎 Bad**
- Mode: **scene-explain**
- Comment: "ERROR: Scene Explainer crashed when video went full-screen"

**Then:**
- Export as Markdown
- Share the report with developers
- Include exact time/context

### Use Case 4: Feature Requests
**Scenario:** You want a keyboard shortcut

**Submit as:**
- Rating: **➖ Neutral**
- Mode: (leave blank)
- Comment: "FEATURE REQUEST: Add Ctrl+Shift+F to open Feedback"

**Organize by:**
- Collect all requests
- Export as CSV
- Sort by mode to prioritize work

---

## 🔄 Integration Patterns

### Pattern 1: Local Testing
**Best for:** Personal use, testing
- No setup needed
- Feedback stored locally
- Export anytime

**How to start:**
1. Open Feedback window
2. Submit feedback as you use the app
3. Export at end of week to analyze

### Pattern 2: Team Feedback Collection
**Best for:** Multiple testers, centralized collection

**Setup:**
1. Set up simple Node.js server
2. Get webhook URL
3. In Settings → Feedback:
   - Enter webhook URL
   - Toggle "Auto-send Feedback"
4. Share ScreenSense with team
5. All feedback auto-sends to your server

**Example webhook:**
```javascript
const express = require('express');
const fs = require('fs');
const app = express();

app.use(express.json());

app.post('/api/feedback', (req, res) => {
  const feedback = req.body;
  // Save to file or database
  fs.appendFileSync('feedback.jsonl', JSON.stringify(feedback) + '\n');
  res.json({ success: true });
});

app.listen(3000);
```

### Pattern 3: Analytics Dashboard
**Best for:** Large-scale analysis

**Approach:**
1. Collect feedback locally/via webhook
2. Export to CSV
3. Import into Power BI / Tableau
4. Create visualizations

**Metrics to track:**
- Satisfaction by mode
- Common complaints
- Feature requests
- Performance trends

---

## 📊 Data Analysis Examples

### Example 1: Rating Distribution
**Export as CSV, then in Excel:**

```
=COUNTIF(C:C,"positive")  // 23
=COUNTIF(C:C,"neutral")   // 8
=COUNTIF(C:C,"negative")  // 4
```

**Result:** 73% positive feedback ✅

### Example 2: Mode Performance
**Pivot Table (Excel/Google Sheets):**

| Mode | Positive | Neutral | Negative |
|------|----------|---------|----------|
| Live Captions | 18 | 3 | 1 |
| Scene Explainer | 3 | 4 | 2 |
| Summarizer | 2 | 1 | 1 |

**Insight:** Live Captions works best!

### Example 3: Common Issues (from Comments)
**Search CSV/Markdown for patterns:**

```
👎 Bad feedback keywords:
- "slow" = 3 mentions
- "missing" = 2 mentions
- "error" = 1 mention

→ Performance and completeness are main concerns
```

---

## ⚙️ Configuration Examples

### Config 1: Self-Hosted Webhook
**Settings:**
```
Webhook URL: http://localhost:3000/api/feedback
Auto-send: ON
```

**Server (Node.js):**
```javascript
app.post('/api/feedback', (req, res) => {
  const { rating, comment, mode } = req.body;
  console.log(`[${mode}] ${rating}: ${comment}`);
  res.json({ success: true });
});
```

### Config 2: Firebase Integration
**Settings:**
```
Webhook URL: https://[project].firebaseio.com/feedback.json
Auto-send: ON
```

**Note:** Requires authentication token in URL

### Config 3: Custom Analytics
**Settings:**
```
Webhook URL: https://your-analytics-api.com/track
Auto-send: ON
```

**Your API receives:**
```json
{
  "id": "1705678932000",
  "timestamp": "2024-01-19T20:22:12.000Z",
  "rating": "positive",
  "comment": "Works great!",
  "mode": "live-captions",
  "sessionDuration": 125000
}
```

---

## 🎯 Best Practices

### For Users
1. **Be Specific**
   - ✅ "Live Captions are 95% accurate on TED talks"
   - ❌ "It's good"

2. **Include Context**
   - ✅ "Scene Explainer missed the math on the whiteboard"
   - ❌ "It doesn't work"

3. **One Issue Per Feedback**
   - ✅ Submit multiple separate items
   - ❌ Bundle 5 issues together

4. **Use Appropriate Rating**
   - 👍 **Good** - Working well, impressed
   - ➖ **Neutral** - Meets expectations
   - 👎 **Bad** - Bug, issue, or strong criticism

### For Analysis
1. **Export Regularly**
   - Weekly CSV exports
   - Keep backups

2. **Track Trends**
   - Month-to-month comparison
   - Pre/post feature release

3. **Act on Feedback**
   - Respond to feature requests
   - Fix reported bugs
   - Share improvements with users

---

## 🔧 Troubleshooting

### "Feedback won't submit"
- ✅ Check rating is selected
- ✅ Comment is optional
- ✅ Try again

### "Webhook not working"
- ✅ Test URL in browser first
- ✅ Check server is running
- ✅ Verify URL is correct
- ✅ Check firewall/network

### "Can't find old feedback"
- ✅ Check Downloads folder for exports
- ✅ Check `%APPDATA%\screensense-ai\feedback.json`
- ✅ Scroll in history panel

### "Export file is empty"
- ✅ Make sure feedback was submitted
- ✅ Wait for files to appear in Downloads
- ✅ Check file opened successfully

---

## 📚 Full Documentation

- **FEEDBACK.md** - Complete user guide
- **FEEDBACK_IMPLEMENTATION.md** - Technical details
- **SETUP.md** - Installation & features overview

---

## 🎉 Next Steps

1. **Try It Now**
   ```bash
   npm start
   # Click Feedback button
   ```

2. **Submit Sample Feedback**
   - Test all 3 ratings
   - Try different modes

3. **Export & Analyze**
   - Export as CSV
   - Open in spreadsheet app

4. **Configure Webhook (Optional)**
   - If collecting team feedback
   - See settings section

5. **Share with Team**
   - Have others test
   - Collect feedback
   - Analyze together

---

**Questions?** See full docs or check the Settings → Feedback section!
