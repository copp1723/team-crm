#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../config/team-config.json');

const emailAddresses = {
  joe: 'joe.assistant@okcrm.onekeel.ai',
  charlie: 'charlie.assistant@okcrm.onekeel.ai',
  tre: 'tre.assistant@okcrm.onekeel.ai',
  josh: 'josh.assistant@okcrm.onekeel.ai',
  kyle: 'kyle.assistant@okcrm.onekeel.ai',
  amanda: 'amanda.assistant@okcrm.onekeel.ai'
};

async function configureEmailAddresses() {
  try {
    console.log('📖 Reading team configuration...');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    console.log('📧 Configuring email addresses for team members...');
    
    // Add email addresses to each team member
    Object.entries(emailAddresses).forEach(([username, email]) => {
      if (config.team.members[username]) {
        config.team.members[username].email = email;
        console.log(`✅ ${username}: ${email}`);
      } else {
        console.log(`⚠️  User ${username} not found in team config`);
      }
    });
    
    // Add email configuration section if it doesn't exist
    if (!config.email) {
      config.email = {
        domain: 'okcrm.onekeel.ai',
        subdomain: 'OKCRM.onekeel.ai',
        provider: 'mailgun',
        settings: {
          apiKey: process.env.MAILGUN_API_KEY || null,
          domain: 'okcrm.onekeel.ai',
          fromAddress: 'noreply@okcrm.onekeel.ai'
        }
      };
      console.log('✅ Added email configuration section');
    }
    
    // Save the updated configuration
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('💾 Configuration saved successfully!');
    
    console.log('\n🎯 Email Configuration Summary:');
    console.log('Domain: okcrm.onekeel.ai');
    console.log('Subdomain: OKCRM.onekeel.ai');
    console.log('\nAssistant Email Addresses:');
    Object.entries(emailAddresses).forEach(([username, email]) => {
      console.log(`- ${username}: ${email}`);
    });
    
    console.log('\n📋 Next Steps:');
    console.log('1. Set up DNS records for okcrm.onekeel.ai');
    console.log('2. Configure Mailgun or your email provider');
    console.log('3. Add MAILGUN_API_KEY to environment variables');
    console.log('4. Test email forwarding to assistant addresses');
    
  } catch (error) {
    console.error('❌ Error configuring email addresses:', error.message);
    process.exit(1);
  }
}

configureEmailAddresses(); 