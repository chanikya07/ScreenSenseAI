# ScreenSense AI Feedback Feature

## Overview

The Feedback feature allows users to share their experience with ScreenSense AI, report bugs, suggest improvements, and rate their sessions. All feedback is stored locally with optional cloud integration.

## Key Features

### 1. **Easy Feedback Submission**
- Rate your experience: 👍 Good, ➖ Neutral, 👎 Bad
- Add detailed comments
- Associate feedback with specific modes
- Automatic session duration tracking

### 2. **Comprehensive History**
- View all your feedback submissions
- Sort by timestamp, rating, or mode
- See metadata for each submission (date, time, mode, duration)

### 3. **Multiple Export Formats**
- **JSON** - Complete raw data, ideal for custom analysis
- **CSV** - Import into spreadsheets and data analysis tools
- **Markdown** - Reader-friendly format with formatting

### 4. **Optional Cloud Integration**
- Send feedback to your own webhook/server
- Auto-send enabled via Settings
- Feedback always saved locally (no data loss)

## How to Access

### From the Panel
1. Click the **💬 Feedback** button in the footer (next to Chat and Export)
2. Or click the **Feedback** mode card in the modes grid

### From Settings
1. Open Settings (⚙ icon)
2. Scroll to "Feedback" section
3. Click "Open Feedback Window →"

## How to Use

### Submitting Feedback

1. **Select a Rating**
   - 👍 **Good** - Working well, impressed
   - ➖ **Neutral** - It's okay, mixed experience
   - 👎 **Bad** - Bug found, feature request, or improvement needed

2. **Choose a Mode (Optional)**
   - Select which ScreenSense mode this feedback is about
   - Helps with analytics and improvements

3. **Write Your Comment**
   - Share specific details about your experience
   - Examples:
     - "Live Captions are very accurate on YouTube videos!"
     - "Scene Explainer sometimes misses teaching moments"
     - "Would love a keyboard shortcut to start recording"

4. **Click Submit**
   - Feedback is instantly saved locally
   - If auto-send is enabled and a webhook is configured, it will be sent

### Viewing History

- All feedback appears in the "Feedback History" panel
- Most recent first
- Click to see full details

### Exporting Feedback

**Local Storage:**
- Feedback stored in: `%APPDATA%\screensense-ai\feedback.json`

**Export Options:**
1. Click **📥 JSON** - Download raw data
2. Click **📊 CSV** - Download spreadsheet format
3. Click **📄 Markdown** - Download formatted report

Files save to your Downloads folder with timestamps.

**Clear All:**
- Click **🗑 Clear All** to permanently delete all feedback
- ⚠️ This action cannot be undone

## Configuration

### In Settings

**Webhook URL (Optional)**
- Enter your server endpoint: `https://your-server.com/feedback`
- Leave blank to use local storage only
- Webhook receives JSON payload with feedback data

**Auto-send Feedback**
- Toggle to automatically send feedback to webhook
- Local copy is always saved
- If webhook fails, feedback remains in history

### Webhook Payload Format

```json
{
  "id": "1705678932000",
  "timestamp": "2024-01-19T20:22:12.000Z",
  "rating": "positive",
  "comment": "Live captions work great!",
  "mode": "live-captions",
  "sessionDuration": 125000
}
```

**Fields:**
- `id` - Unique feedback ID
- `timestamp` - ISO 8601 timestamp
- `rating` - "positive", "neutral", or "negative"
- `comment` - User's feedback text (can be empty)
- `mode` - ScreenSense mode ("live-captions", "scene-explain", "transcript", "summarizer", "face-analysis", or null)
- `sessionDuration` - Duration in milliseconds

## Use Cases

### For Users
- Report bugs and issues
- Request new features
- Share what's working well
- Track personal experience over time

### For Developers (You)
- Collect user feedback without external services
- Identify patterns in user satisfaction
- Prioritize feature improvements
- Debug specific issues
- Export data for analysis

### For Analytics
- Track mode performance
- Understand user satisfaction trends
- Identify which features need improvement
- Generate reports

## Free Services Integration (Optional)

While ScreenSense AI doesn't require any paid services, you can integrate with:

### Self-Hosted Options
1. **Node.js Express Server** - Simple webhook receiver
2. **Firebase Realtime Database** - Free tier, no backend needed
3. **Supabase** - Open-source Firebase alternative
4. **JSON Placeholder** - Testing/demo purposes

### Example: Node.js Express Webhook

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/feedback', (req, res) => {
  const feedback = req.body;
  console.log('New feedback:', feedback);
  
  // Save to database, file, or email
  // Example: append to file
  const fs = require('fs');
  fs.appendFileSync('feedback.jsonl', JSON.stringify(feedback) + '\n');
  
  res.json({ success: true, id: feedback.id });
});

app.listen(3000, () => console.log('Feedback server running'));
```

### Example: Firebase Integration

```javascript
// In your feedback settings, use:
// https://your-project.firebaseio.com/feedback.json?auth=YOUR_TOKEN
```

## Data Privacy

- ✅ All feedback stored locally by default
- ✅ No data sent without your permission
- ✅ You control the webhook URL
- ✅ You can delete feedback anytime
- ✅ Complete export capability

## Tips for Best Results

1. **Be Specific** - "Scene Explainer missed the whiteboard equation" is better than "not working"
2. **Include Context** - Mention which app you were using (YouTube, Meet, etc.)
3. **One Issue Per Feedback** - Easier to track and fix
4. **Rate Honestly** - Helps balance feedback and identify real issues
5. **Export Regularly** - Back up your feedback data

## Troubleshooting

**Feedback won't submit?**
- Check that you selected a rating
- Comment is optional
- Try again or restart the app

**Webhook not receiving feedback?**
- Verify URL is correct and accessible
- Check server logs for errors
- Try sending a test request to your webhook
- Ensure HTTPS is properly configured

**Can't find old feedback?**
- Check if you cleared the history
- Check your exported files
- Feedback files located at: `%APPDATA%\screensense-ai\feedback.json`

**Export file is huge?**
- Normal if you've used ScreenSense extensively
- CSV files are usually smaller than JSON
- Consider clearing old feedback if needed

## Keyboard Shortcuts

- **None yet** - Open via UI buttons
- Future: Consider adding Ctrl+? to open feedback

## Analytics & Reporting

### Generated Report (Markdown Export)

```
# ScreenSense AI - Feedback Report

Generated: 2024-01-19T20:22:12Z
Total Feedback: 47

## Feedback #1
- **Timestamp**: 2024-01-19T20:15:00Z
- **Rating**: positive
- **Mode**: live-captions
- **Duration**: 325s
- **Comment**: Captions are very accurate!

...
```

### Custom Analysis

Export to CSV and analyze in:
- Excel/Google Sheets
- Python (pandas)
- R
- Tableau
- Power BI

## Future Enhancements

Potential additions:
- 📸 Screenshot capture with feedback
- 🤖 AI-powered feedback sentiment analysis
- 📊 Dashboard with feedback statistics
- 🔗 GitHub issue creation from feedback
- 🌐 Anonymous feedback sharing
- ⭐ Rating distribution visualization
- 📧 Email notifications for important feedback

## API Reference

### IPC Methods (in window.ss)

```javascript
// Submit feedback
await window.ss.feedbackSubmit({
  rating: 'positive',      // 'positive', 'neutral', 'negative'
  comment: 'Great!',       // string or empty
  mode: 'live-captions',   // string or null
  sessionDuration: 12000,  // milliseconds
  screenshot: null         // future: base64 image
})

// Get all feedback
const history = await window.ss.feedbackGetHistory()

// Export to file
await window.ss.feedbackExport('json')  // 'json', 'csv', 'markdown'

// Send to webhook
await window.ss.feedbackSendToServer({
  feedbackData: {...},
  webhookUrl: 'https://...'
})

// Clear all feedback
await window.ss.feedbackClearHistory()
```

## Contact & Support

- 📝 Use the Feedback feature to report issues!
- 🐛 Include "BUG:" prefix for bug reports
- 💡 Include "FEATURE:" prefix for suggestions
- ⚠️ Include "ERROR:" prefix for errors with details

## License & Attribution

Feedback feature is part of ScreenSense AI.
All user feedback remains yours to export and analyze.
