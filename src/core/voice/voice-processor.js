/**
 * Voice Processor
 * Handles voice input processing, commands, and integration with team updates
 */

import { SpeechToText } from './speech-to-text.js';

export class VoiceProcessor {
    constructor(options = {}) {
        this.options = {
            autoSubmit: options.autoSubmit || false,
            autoSubmitDelay: options.autoSubmitDelay || 2000, // 2 seconds of silence
            commandMode: options.commandMode !== false,
            commandPrefix: options.commandPrefix || 'command',
            punctuationMode: options.punctuationMode !== false,
            noiseReduction: options.noiseReduction !== false,
            // Callbacks
            onTranscript: options.onTranscript || (() => {}),
            onCommand: options.onCommand || (() => {}),
            onSubmit: options.onSubmit || (() => {}),
            onStateChange: options.onStateChange || (() => {}),
            onError: options.onError || (() => {})
        };
        
        // Initialize speech recognition
        this.speechToText = null;
        this.initializeSpeechRecognition();
        
        // State management
        this.state = {
            isListening: false,
            isProcessing: false,
            currentTranscript: '',
            lastTranscript: '',
            mode: 'dictation' // 'dictation' or 'command'
        };
        
        // Voice commands
        this.commands = this.initializeCommands();
        
        // Auto-submit timer
        this.autoSubmitTimer = null;
        
        // Audio feedback
        this.audioContext = null;
        this.initializeAudioFeedback();
        
        // Performance metrics
        this.metrics = {
            totalWords: 0,
            totalCommands: 0,
            averageConfidence: 0,
            sessionStartTime: null
        };
    }
    
    /**
     * Initialize speech recognition
     */
    initializeSpeechRecognition() {
        this.speechToText = new SpeechToText({
            continuous: true,
            interimResults: true,
            onStart: () => this.handleStart(),
            onEnd: () => this.handleEnd(),
            onResult: (result) => this.handleResult(result),
            onError: (error) => this.handleError(error),
            onSpeechEnd: () => this.handleSpeechEnd()
        });
        
        // Check if supported
        if (!this.speechToText.isSupported) {
            this.options.onError({
                error: 'not-supported',
                message: 'Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.'
            });
        }
    }
    
    /**
     * Initialize voice commands
     */
    initializeCommands() {
        return {
            // Text editing commands
            'new line': () => this.insertText('\n'),
            'new paragraph': () => this.insertText('\n\n'),
            'period': () => this.insertText('. '),
            'comma': () => this.insertText(', '),
            'question mark': () => this.insertText('? '),
            'exclamation': () => this.insertText('! '),
            'colon': () => this.insertText(': '),
            'semicolon': () => this.insertText('; '),
            'open quote': () => this.insertText('"'),
            'close quote': () => this.insertText('"'),
            'dash': () => this.insertText(' - '),
            
            // Action commands
            'clear all': () => this.clearTranscript(),
            'undo': () => this.undo(),
            'submit': () => this.submit(),
            'send': () => this.submit(),
            'cancel': () => this.cancel(),
            'stop listening': () => this.stop(),
            
            // Mode commands
            'command mode': () => this.setMode('command'),
            'dictation mode': () => this.setMode('dictation'),
            
            // Team member selection (dynamic)
            'select joe': () => this.selectTeamMember('joe'),
            'select charlie': () => this.selectTeamMember('charlie'),
            'select tre': () => this.selectTeamMember('tre'),
            'switch to joe': () => this.selectTeamMember('joe'),
            'switch to charlie': () => this.selectTeamMember('charlie'),
            'switch to tre': () => this.selectTeamMember('tre')
        };
    }
    
    /**
     * Initialize audio feedback
     */
    initializeAudioFeedback() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Audio feedback not available:', error);
        }
    }
    
    /**
     * Start voice input
     */
    async start() {
        if (!this.speechToText.isSupported) {
            throw new Error('Speech recognition not supported');
        }
        
        if (this.state.isListening) {
            return;
        }
        
        try {
            await this.speechToText.start();
            this.metrics.sessionStartTime = Date.now();
            
            // Play start sound
            this.playFeedbackSound('start');
            
        } catch (error) {
            this.options.onError({
                error: 'start-failed',
                message: 'Failed to start voice input',
                details: error.message
            });
            throw error;
        }
    }
    
    /**
     * Stop voice input
     */
    stop() {
        if (!this.state.isListening) {
            return;
        }
        
        this.speechToText.stop();
        this.clearAutoSubmitTimer();
        
        // Play stop sound
        this.playFeedbackSound('stop');
    }
    
    /**
     * Handle recognition start
     */
    handleStart() {
        this.state.isListening = true;
        this.updateState();
        this.options.onStateChange(this.state);
    }
    
    /**
     * Handle recognition end
     */
    handleEnd() {
        this.state.isListening = false;
        this.updateState();
        this.options.onStateChange(this.state);
        
        // Update metrics
        if (this.metrics.sessionStartTime) {
            const duration = Date.now() - this.metrics.sessionStartTime;
            console.log(`Voice session duration: ${duration}ms`);
        }
    }
    
    /**
     * Handle recognition result
     */
    handleResult(result) {
        if (result.isFinal) {
            // Final result
            const processed = this.processTranscript(result.transcript);
            
            // Check for commands
            if (this.options.commandMode && this.checkForCommand(processed)) {
                return; // Command was executed
            }
            
            // Add to transcript
            this.state.currentTranscript += processed + ' ';
            this.state.lastTranscript = processed;
            
            // Update metrics
            this.metrics.totalWords += processed.split(' ').length;
            this.metrics.averageConfidence = 
                (this.metrics.averageConfidence + result.confidence) / 2;
            
            // Notify callback
            this.options.onTranscript({
                transcript: this.state.currentTranscript,
                lastSegment: processed,
                confidence: result.confidence
            });
            
            // Reset auto-submit timer
            if (this.options.autoSubmit) {
                this.resetAutoSubmitTimer();
            }
            
        } else {
            // Interim result - show for real-time feedback
            this.options.onTranscript({
                transcript: this.state.currentTranscript + result.transcript,
                isInterim: true,
                confidence: 0
            });
        }
    }
    
    /**
     * Handle speech end
     */
    handleSpeechEnd() {
        // Start auto-submit timer if enabled
        if (this.options.autoSubmit && this.state.currentTranscript.trim()) {
            this.resetAutoSubmitTimer();
        }
    }
    
    /**
     * Handle recognition error
     */
    handleError(error) {
        this.options.onError(error);
        
        // Play error sound
        this.playFeedbackSound('error');
    }
    
    /**
     * Process transcript
     */
    processTranscript(transcript) {
        let processed = transcript.trim();
        
        // Apply punctuation if enabled
        if (this.options.punctuationMode) {
            processed = this.applySmartPunctuation(processed);
        }
        
        // Capitalize first letter
        if (this.state.currentTranscript === '' || 
            this.state.currentTranscript.match(/[.!?]\s*$/)) {
            processed = processed.charAt(0).toUpperCase() + processed.slice(1);
        }
        
        return processed;
    }
    
    /**
     * Apply smart punctuation
     */
    applySmartPunctuation(text) {
        // Add period at end if missing
        if (text.length > 10 && !text.match(/[.!?]$/)) {
            // Check if it's likely a question
            const questionWords = ['what', 'when', 'where', 'who', 'why', 'how', 'is', 'are', 'can', 'could', 'would', 'should'];
            const firstWord = text.split(' ')[0].toLowerCase();
            
            if (questionWords.includes(firstWord)) {
                text += '?';
            } else {
                text += '.';
            }
        }
        
        return text;
    }
    
    /**
     * Check for and execute commands
     */
    checkForCommand(text) {
        const lowerText = text.toLowerCase();
        
        // Check if in command mode or has command prefix
        if (this.state.mode !== 'command' && !lowerText.startsWith(this.options.commandPrefix)) {
            return false;
        }
        
        // Remove command prefix if present
        const commandText = lowerText.replace(new RegExp(`^${this.options.commandPrefix}\\s*`), '');
        
        // Check each command
        for (const [command, action] of Object.entries(this.commands)) {
            if (commandText === command || commandText.endsWith(command)) {
                action();
                this.metrics.totalCommands++;
                
                // Play command sound
                this.playFeedbackSound('command');
                
                this.options.onCommand({
                    command: command,
                    originalText: text
                });
                
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Insert text at current position
     */
    insertText(text) {
        this.state.currentTranscript += text;
        this.options.onTranscript({
            transcript: this.state.currentTranscript,
            inserted: text
        });
    }
    
    /**
     * Clear transcript
     */
    clearTranscript() {
        this.state.currentTranscript = '';
        this.state.lastTranscript = '';
        this.options.onTranscript({
            transcript: '',
            cleared: true
        });
    }
    
    /**
     * Undo last segment
     */
    undo() {
        if (this.state.lastTranscript) {
            const index = this.state.currentTranscript.lastIndexOf(this.state.lastTranscript);
            if (index >= 0) {
                this.state.currentTranscript = 
                    this.state.currentTranscript.substring(0, index).trim() + ' ';
                this.state.lastTranscript = '';
                
                this.options.onTranscript({
                    transcript: this.state.currentTranscript,
                    undone: true
                });
            }
        }
    }
    
    /**
     * Submit the current transcript
     */
    submit() {
        if (!this.state.currentTranscript.trim()) {
            return;
        }
        
        const transcript = this.state.currentTranscript.trim();
        
        this.options.onSubmit({
            transcript: transcript,
            wordCount: transcript.split(' ').length,
            confidence: this.metrics.averageConfidence,
            duration: this.metrics.sessionStartTime ? 
                Date.now() - this.metrics.sessionStartTime : 0
        });
        
        // Clear after submit
        this.clearTranscript();
        
        // Play submit sound
        this.playFeedbackSound('submit');
    }
    
    /**
     * Cancel current input
     */
    cancel() {
        this.clearTranscript();
        this.stop();
    }
    
    /**
     * Set recognition mode
     */
    setMode(mode) {
        this.state.mode = mode;
        this.updateState();
        
        this.options.onStateChange(this.state);
    }
    
    /**
     * Select team member
     */
    selectTeamMember(memberId) {
        // This would integrate with the UI to select team member
        if (window.selectTeamMember) {
            window.selectTeamMember(memberId);
        }
        
        this.options.onCommand({
            command: 'select-member',
            member: memberId
        });
    }
    
    /**
     * Auto-submit timer management
     */
    resetAutoSubmitTimer() {
        this.clearAutoSubmitTimer();
        
        this.autoSubmitTimer = setTimeout(() => {
            if (this.state.currentTranscript.trim()) {
                this.submit();
            }
        }, this.options.autoSubmitDelay);
    }
    
    clearAutoSubmitTimer() {
        if (this.autoSubmitTimer) {
            clearTimeout(this.autoSubmitTimer);
            this.autoSubmitTimer = null;
        }
    }
    
    /**
     * Play feedback sounds
     */
    playFeedbackSound(type) {
        if (!this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Configure sound based on type
            switch (type) {
                case 'start':
                    oscillator.frequency.value = 523.25; // C5
                    gainNode.gain.value = 0.1;
                    break;
                case 'stop':
                    oscillator.frequency.value = 261.63; // C4
                    gainNode.gain.value = 0.1;
                    break;
                case 'command':
                    oscillator.frequency.value = 659.25; // E5
                    gainNode.gain.value = 0.15;
                    break;
                case 'submit':
                    oscillator.frequency.value = 783.99; // G5
                    gainNode.gain.value = 0.15;
                    break;
                case 'error':
                    oscillator.frequency.value = 220; // A3
                    gainNode.gain.value = 0.2;
                    break;
            }
            
            // Fade out
            gainNode.gain.exponentialRampToValueAtTime(
                0.01, 
                this.audioContext.currentTime + 0.1
            );
            
            // Play
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 0.1);
            
        } catch (error) {
            console.warn('Could not play feedback sound:', error);
        }
    }
    
    /**
     * Update state
     */
    updateState() {
        this.state.isProcessing = this.state.isListening && this.state.currentTranscript.length > 0;
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            ...this.state,
            supportInfo: this.speechToText ? this.speechToText.getState() : null,
            metrics: this.metrics
        };
    }
    
    /**
     * Set language
     */
    setLanguage(lang) {
        if (this.speechToText) {
            this.speechToText.setLanguage(lang);
        }
    }
    
    /**
     * Get supported languages
     */
    static getSupportedLanguages() {
        return SpeechToText.getSupportedLanguages();
    }
    
    /**
     * Destroy and clean up
     */
    destroy() {
        this.stop();
        this.clearAutoSubmitTimer();
        
        if (this.speechToText) {
            this.speechToText.destroy();
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Export a factory function for easy initialization
export function createVoiceProcessor(options) {
    return new VoiceProcessor(options);
}