/**
 * Test script for Voice Input Infrastructure
 * Tests browser compatibility and voice processing components
 */

import { SpeechToText, checkSpeechRecognitionSupport } from './src/core/voice/speech-to-text.js';
import { VoiceProcessor } from './src/core/voice/voice-processor.js';

console.log('🎤 Testing Voice Input Infrastructure...\n');

// Test 1: Browser Support
console.log('Test 1: Browser Support');
const support = checkSpeechRecognitionSupport();
console.log('  Supported:', support.supported);
console.log('  Vendor:', support.vendor);
console.log('  Mobile:', support.mobile);
console.log('  Notes:', support.notes.join(', '));
console.log();

// Test 2: Speech Recognition
console.log('Test 2: Speech Recognition API');
if (support.supported) {
    const speechToText = new SpeechToText({
        lang: 'en-US',
        continuous: true,
        interimResults: true,
        onStart: () => console.log('  ✅ Speech recognition started'),
        onEnd: (data) => console.log('  ✅ Speech recognition ended', data),
        onResult: (result) => {
            if (result.isFinal) {
                console.log('  Final transcript:', result.transcript);
                console.log('  Confidence:', (result.confidence * 100).toFixed(1) + '%');
            } else {
                console.log('  Interim:', result.transcript);
            }
        },
        onError: (error) => console.error('  ❌ Error:', error.message)
    });
    
    console.log('  State:', speechToText.getState());
    console.log();
} else {
    console.log('  ❌ Speech recognition not supported in this environment');
    console.log();
}

// Test 3: Voice Processor
console.log('Test 3: Voice Processor');
const processor = new VoiceProcessor({
    autoSubmit: true,
    autoSubmitDelay: 2000,
    punctuationMode: true,
    commandMode: true,
    onTranscript: (data) => console.log('  Transcript update:', data.transcript?.substring(0, 50) + '...'),
    onCommand: (data) => console.log('  Command executed:', data.command),
    onSubmit: (data) => console.log('  Submitted:', {
        wordCount: data.wordCount,
        confidence: data.confidence,
        duration: data.duration
    }),
    onStateChange: (state) => console.log('  State change:', {
        isListening: state.isListening,
        mode: state.mode
    }),
    onError: (error) => console.error('  Error:', error.message)
});

console.log('  Voice processor initialized');
console.log('  Available commands:', Object.keys(processor.commands).length);
console.log();

// Test 4: Language Support
console.log('Test 4: Language Support');
const languages = SpeechToText.getSupportedLanguages();
console.log('  Total languages:', languages.length);
console.log('  Sample languages:');
languages.slice(0, 5).forEach(lang => {
    console.log(`    - ${lang.name} (${lang.code})`);
});
console.log();

// Test 5: Voice Commands
console.log('Test 5: Voice Commands');
const testCommands = [
    'new line',
    'period',
    'clear all',
    'submit',
    'select joe'
];

console.log('  Testing command recognition:');
testCommands.forEach(cmd => {
    const recognized = processor.checkForCommand(cmd);
    console.log(`    "${cmd}": ${recognized ? '✅ Recognized' : '❌ Not recognized'}`);
});
console.log();

// Test 6: Browser Compatibility Matrix
console.log('Test 6: Browser Compatibility Matrix');
const browsers = [
    { name: 'Chrome', userAgent: 'Chrome', expected: true },
    { name: 'Safari', userAgent: 'Safari', expected: true },
    { name: 'Firefox', userAgent: 'Firefox', expected: false },
    { name: 'Edge', userAgent: 'Edg', expected: true }
];

browsers.forEach(browser => {
    const isCurrentBrowser = navigator.userAgent.includes(browser.userAgent);
    if (isCurrentBrowser) {
        console.log(`  ${browser.name}: ${support.supported ? '✅' : '❌'} (Current browser)`);
    } else {
        console.log(`  ${browser.name}: ${browser.expected ? '✅ Expected' : '❌ Not supported'}`);
    }
});
console.log();

// Test 7: Mobile Support
console.log('Test 7: Mobile Device Support');
const mobileDevices = [
    { name: 'iPhone/iPad', pattern: /iPad|iPhone|iPod/, notes: 'Requires user interaction' },
    { name: 'Android Chrome', pattern: /Android.*Chrome/, notes: 'Full support' },
    { name: 'Android Other', pattern: /Android/, notes: 'Limited support' }
];

const userAgent = navigator.userAgent;
let deviceDetected = false;

mobileDevices.forEach(device => {
    if (device.pattern.test(userAgent)) {
        console.log(`  ${device.name}: Detected - ${device.notes}`);
        deviceDetected = true;
    }
});

if (!deviceDetected) {
    console.log('  Desktop browser detected');
}
console.log();

// Test 8: Performance Metrics
console.log('Test 8: Performance Metrics');
if (processor) {
    const metrics = processor.getState().metrics;
    console.log('  Session metrics:', {
        totalWords: metrics.totalWords,
        totalCommands: metrics.totalCommands,
        averageConfidence: metrics.averageConfidence.toFixed(2)
    });
}
console.log();

// Summary
console.log('📊 Summary:');
console.log('  Speech Recognition:', support.supported ? '✅ Available' : '❌ Not available');
console.log('  Current Browser:', navigator.userAgent.split(' ').pop());
console.log('  Recommendations:');

if (!support.supported) {
    console.log('    - Use Chrome, Edge, or Safari for voice input');
    console.log('    - Firefox does not support Web Speech API');
} else {
    console.log('    - Voice input is ready to use');
    console.log('    - Grant microphone permissions when prompted');
}

if (support.mobile) {
    console.log('    - Mobile device detected');
    console.log('    - Ensure microphone permissions are granted in browser settings');
}

console.log('\n✅ Voice input infrastructure test complete!');

// Cleanup
if (processor) {
    processor.destroy();
}