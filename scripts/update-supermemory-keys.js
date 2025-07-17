#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../config/team-config.json');

const supermemoryKeys = {
  joe: 'sm_dy7m3s5FbqC2DaFMkKoTw1_eqeTRieoUiiNSbdebASrJOLytIDibiINzceXWkPkMzNTiNpQzIYbgadhSKnHTyty',
  tre: 'sm_dy7m3s5FbqC2DaFMkKoTw1_BuDUfYMUxhFsVTXOAGylAWPDEIHEjBZCtXLjeYCjSHtPigMKaiRFfSBypZSpQiki',
  josh: 'sm_dy7m3s5FbqC2DaFMkKoTw1_ubkCkKKNiUJYISeeAzAWxCQnkwwcmNdXSOQPVjcLLUxIjDYVZfBFVTGqiAMNTsJq',
  kyle: 'sm_dy7m3s5FbqC2DaFMkKoTw1_TVJLoCJmFTPcMWGzsjkcmQFCqUPiWjvmMlJIbfCewaQHReUcuQwcxWNCzUvmaOcG',
  amanda: 'sm_dy7m3s5FbqC2DaFMkKoTw1_GPmSAYgDtFWriEnwfndnmAXGJnkvrfUTHrnbOHTavUYRsZgbAblisfikmUAwrjhs'
};

async function updateSupermemoryKeys() {
  try {
    console.log('📖 Reading team configuration...');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    console.log('🔑 Updating Supermemory keys for team members...');
    
    // Update each team member's Supermemory key
    Object.entries(supermemoryKeys).forEach(([username, key]) => {
      if (config.team.members[username]) {
        config.team.members[username].supermemory_key = key;
        console.log(`✅ Updated ${username}: ${key.substring(0, 20)}...`);
      } else {
        console.log(`⚠️  User ${username} not found in team config`);
      }
    });
    
    // Set Charlie's key to null (no individual key provided)
    if (config.team.members.charlie) {
      config.team.members.charlie.supermemory_key = null;
      console.log('✅ Set Charlie to use fallback Supermemory key');
    }
    
    // Save the updated configuration
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('💾 Configuration saved successfully!');
    
    console.log('\n🎯 Summary:');
    console.log('- Joe: Individual Supermemory key set');
    console.log('- Tre: Individual Supermemory key set');
    console.log('- Josh: Individual Supermemory key set');
    console.log('- Kyle: Individual Supermemory key set');
    console.log('- Amanda: Individual Supermemory key set');
    console.log('- Charlie: Using fallback Supermemory key');
    
  } catch (error) {
    console.error('❌ Error updating Supermemory keys:', error.message);
    process.exit(1);
  }
}

updateSupermemoryKeys(); 