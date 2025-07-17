# Email Integration Setup Guide

## 📧 **Team CRM Email Configuration**

Your Team CRM system is now configured with individual email addresses for each team member's AI assistant.

### **🎯 Assistant Email Addresses**

| Team Member | Assistant Email |
|-------------|-----------------|
| Joe | `joe.assistant@okcrm.onekeel.ai` |
| Charlie | `charlie.assistant@okcrm.onekeel.ai` |
| Tre | `tre.assistant@okcrm.onekeel.ai` |
| Josh | `josh.assistant@okcrm.onekeel.ai` |
| Kyle | `kyle.assistant@okcrm.onekeel.ai` |
| Amanda | `amanda.assistant@okcrm.onekeel.ai` |

### **🌐 Domain Configuration**

- **Primary Domain:** `okcrm.onekeel.ai`
- **Subdomain:** `OKCRM.onekeel.ai`
- **Email Provider:** Mailgun (recommended)

---

## **📋 Setup Steps**

### **1. DNS Configuration**

Add these DNS records to your domain registrar:

```
# A Record for main domain
okcrm.onekeel.ai → [Your Render IP or CNAME to your Render URL]

# MX Records for email
okcrm.onekeel.ai → mxa.mailgun.org (Priority: 10)
okcrm.onekeel.ai → mxb.mailgun.org (Priority: 10)

# SPF Record
okcrm.onekeel.ai → TXT: "v=spf1 include:mailgun.org ~all"

# DKIM Record (get from Mailgun)
okcrm.onekeel.ai → TXT: [DKIM key from Mailgun]
```

### **2. Mailgun Setup**

1. **Create Mailgun Account:**
   - Go to [mailgun.com](https://mailgun.com)
   - Sign up for an account
   - Add domain: `okcrm.onekeel.ai`

2. **Get API Key:**
   - Go to Settings → API Keys
   - Copy your Private API Key

3. **Add to Render Environment Variables:**
   ```
   MAILGUN_API_KEY=your_mailgun_api_key_here
   MAILGUN_DOMAIN=okcrm.onekeel.ai
   ```

### **3. Email Forwarding Setup**

Configure email forwarding rules in your domain provider or Mailgun:

```
# Forward all assistant emails to your Team CRM webhook
*.assistant@okcrm.onekeel.ai → https://team-crm.onrender.com/api/email/webhook
```

### **4. Test Email Integration**

1. **Send a test email** to `joe.assistant@okcrm.onekeel.ai`
2. **Check the Team CRM logs** to see if it's processed
3. **Verify the AI assistant responds** appropriately

---

## **🔧 How It Works**

### **Email Flow:**
1. **Team member forwards email** to their assistant address
2. **Mailgun receives email** and forwards to Team CRM webhook
3. **Team CRM processes email** using AI to extract insights
4. **AI assistant responds** with analysis and action items
5. **Response is sent back** to the original sender

### **AI Processing:**
- **Context Extraction:** AI analyzes email content for key information
- **Priority Assessment:** Determines urgency and importance
- **Action Items:** Identifies next steps and deadlines
- **Memory Storage:** Stores insights in individual Supermemory
- **Team Updates:** Shares relevant information with team

---

## **🚀 Usage Examples**

### **Example 1: Sales Update**
```
From: joe@company.com
To: joe.assistant@okcrm.onekeel.ai
Subject: Dealer Meeting - ABC Motors

Hi, just had a great meeting with ABC Motors. They're interested in our pilot program and want to start next month. Need to follow up on pricing and get contracts ready.
```

**AI Response:**
```
✅ Meeting logged with ABC Motors
🎯 Priority: High (Pilot opportunity)
📋 Action Items:
- Follow up on pricing details
- Prepare pilot contracts
- Schedule contract review meeting
💾 Stored in Joe's memory for future reference
```

### **Example 2: Customer Issue**
```
From: tre@company.com
To: tre.assistant@okcrm.onekeel.ai
Subject: Urgent - XYZ Dealership having issues

XYZ Dealership is experiencing technical difficulties with our platform. Their team is frustrated and threatening to cancel if we don't fix this quickly.
```

**AI Response:**
```
🚨 URGENT: Customer at risk
🎯 Priority: Critical
📋 Immediate Actions:
- Escalate to technical team
- Schedule emergency call with XYZ
- Prepare status update for team
⚠️ Alert sent to executives
```

---

## **📊 Benefits**

### **For Team Members:**
- **Personal AI Assistant:** Each person gets their own AI helper
- **Email Processing:** Automatically analyze and respond to emails
- **Memory:** AI remembers past conversations and context
- **Priority Management:** Automatically flag urgent items

### **For the Team:**
- **Centralized Updates:** All important info captured in one place
- **Executive Summaries:** AI creates strategic summaries for leadership
- **Knowledge Sharing:** Insights automatically shared across team
- **Activity Tracking:** Complete record of all team activities

---

## **🔍 Troubleshooting**

### **Common Issues:**

1. **Emails not being received:**
   - Check DNS records are correct
   - Verify Mailgun domain verification
   - Test webhook endpoint is accessible

2. **AI not responding:**
   - Check OpenRouter API key is valid
   - Verify Supermemory API keys are working
   - Check server logs for errors

3. **Email formatting issues:**
   - Ensure proper email headers
   - Check for special characters in content
   - Verify email size limits

### **Support:**
- Check server logs at `https://team-crm.onrender.com/admin`
- Review email processing in admin interface
- Test individual components via API endpoints

---

## **✅ Next Steps**

1. **Set up DNS records** for `okcrm.onekeel.ai`
2. **Configure Mailgun** with your domain
3. **Add MAILGUN_API_KEY** to Render environment variables
4. **Test email forwarding** with a simple test email
5. **Train your team** on using assistant email addresses

Your Team CRM is now ready for full email integration! 🚀 