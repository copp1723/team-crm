/**
 * Voice Button Component
 * Reusable voice input button that can be integrated into existing interfaces
 */

import { VoiceProcessor } from '/src/core/voice/voice-processor.js';
import { checkSpeechRecognitionSupport } from '/src/core/voice/speech-to-text.js';

export class VoiceButtonComponent {
    constructor(options = {}) {
        this.options = {
            containerId: options.containerId || 'voice-button-container',
            textareaId: options.textareaId || 'updateText',
            onSubmit: options.onSubmit || null,
            autoSubmit: options.autoSubmit || false,
            autoSubmitDelay: options.autoSubmitDelay || 3000,
            style: options.style || 'inline', // 'inline', 'floating', 'large'
            position: options.position || 'right' // for inline style
        };
        
        this.voiceProcessor = null;
        this.isListening = false;
        this.container = null;
        this.button = null;
        this.textarea = null;
        
        // Check browser support
        this.support = checkSpeechRecognitionSupport();
    }
    
    /**
     * Initialize the component
     */
    init() {
        // Find container
        this.container = document.getElementById(this.options.containerId);
        if (!this.container) {
            console.error(`Container with ID '${this.options.containerId}' not found`);
            return;
        }
        
        // Find textarea
        this.textarea = document.getElementById(this.options.textareaId);
        if (!this.textarea) {
            console.error(`Textarea with ID '${this.options.textareaId}' not found`);
            return;
        }
        
        // Create voice button
        this.createButton();
        
        // Initialize voice processor if supported
        if (this.support.supported) {
            this.initializeVoiceProcessor();
        }
    }
    
    /**
     * Create the voice button UI
     */
    createButton() {
        // Add styles
        this.addStyles();
        
        // Create button HTML
        const buttonHtml = `
            <button id="voiceInputBtn" class="voice-btn ${this.options.style}" 
                    ${!this.support.supported ? 'disabled' : ''}
                    title="${this.support.supported ? 'Click to start voice input' : 'Voice input not supported in this browser'}">
                <svg class="voice-icon" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                <span class="voice-status"></span>
            </button>
            ${!this.support.supported ? `
                <div class="voice-unsupported-notice">
                    Voice input requires Chrome, Edge, or Safari
                </div>
            ` : ''}
        `;
        
        // Insert button
        this.container.innerHTML = buttonHtml;
        this.button = document.getElementById('voiceInputBtn');
        
        // Add event listener
        if (this.support.supported) {
            this.button.addEventListener('click', () => this.toggleVoice());
        }
    }
    
    /**
     * Add component styles
     */
    addStyles() {
        if (document.getElementById('voice-button-styles')) return;
        
        const styles = `
            <style id="voice-button-styles">
                /* Base voice button styles */
                .voice-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background: #ffffff;
                    color: #666666;
                    border: 2px solid #e0e0e0;
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                }
                
                .voice-btn:hover:not(:disabled) {
                    border-color: #000000;
                }
                
                .voice-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .voice-btn.listening {
                    background: #ff3333;
                    color: #ffffff;
                    border-color: #ff3333;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(255, 51, 51, 0.4);
                    }
                    70% {
                        box-shadow: 0 0 0 10px rgba(255, 51, 51, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(255, 51, 51, 0);
                    }
                }
                
                .voice-icon {
                    width: 24px;
                    height: 24px;
                    fill: currentColor;
                }
                
                .voice-status {
                    margin-left: 8px;
                    font-size: 14px;
                    display: none;
                }
                
                .voice-btn.listening .voice-status {
                    display: inline;
                }
                
                /* Inline style */
                .voice-btn.inline {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 14px;
                }
                
                /* Floating style */
                .voice-btn.floating {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    z-index: 1000;
                }
                
                .voice-btn.floating .voice-status {
                    display: none !important;
                }
                
                /* Large style */
                .voice-btn.large {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    border-width: 3px;
                }
                
                .voice-btn.large .voice-icon {
                    width: 36px;
                    height: 36px;
                }
                
                /* Unsupported notice */
                .voice-unsupported-notice {
                    font-size: 12px;
                    color: #999999;
                    margin-top: 4px;
                }
                
                /* Transcript overlay for floating button */
                .voice-transcript-overlay {
                    position: fixed;
                    bottom: 90px;
                    right: 24px;
                    background: #ffffff;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 12px;
                    max-width: 300px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    display: none;
                    z-index: 999;
                }
                
                .voice-transcript-overlay.show {
                    display: block;
                }
                
                .voice-transcript-text {
                    font-size: 14px;
                    color: #333333;
                    margin: 0;
                }
                
                .voice-transcript-interim {
                    color: #999999;
                    font-style: italic;
                }
            </style>
        `;
        
        document.head.insertAdjacentHTML('beforeend', styles);
    }
    
    /**
     * Initialize voice processor
     */
    initializeVoiceProcessor() {
        this.voiceProcessor = new VoiceProcessor({
            autoSubmit: this.options.autoSubmit,
            autoSubmitDelay: this.options.autoSubmitDelay,
            onTranscript: (data) => this.handleTranscript(data),
            onSubmit: (data) => this.handleSubmit(data),
            onStateChange: (state) => this.handleStateChange(state),
            onError: (error) => this.handleError(error)
        });
    }
    
    /**
     * Toggle voice input
     */
    toggleVoice() {
        if (this.isListening) {
            this.voiceProcessor.stop();
        } else {
            this.voiceProcessor.start().catch(error => {
                this.handleError({
                    message: 'Failed to start voice input. Please ensure microphone access is allowed.'
                });
            });
        }
    }
    
    /**
     * Handle transcript updates
     */
    handleTranscript(data) {
        if (this.textarea) {
            // Get current text and cursor position
            const currentText = this.textarea.value;
            const cursorPos = this.textarea.selectionStart;
            
            if (data.cleared) {
                // Clear was called
                this.textarea.value = '';
            } else if (data.undone) {
                // Undo was called
                this.textarea.value = data.transcript;
            } else if (data.inserted) {
                // Text was inserted (punctuation, etc.)
                const before = currentText.substring(0, cursorPos);
                const after = currentText.substring(cursorPos);
                this.textarea.value = before + data.inserted + after;
                
                // Move cursor after inserted text
                const newPos = cursorPos + data.inserted.length;
                this.textarea.setSelectionRange(newPos, newPos);
            } else {
                // Regular transcript update
                this.textarea.value = data.transcript;
            }
            
            // Trigger input event for any listeners
            this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Update floating overlay if using floating style
        if (this.options.style === 'floating') {
            this.updateTranscriptOverlay(data.transcript, data.isInterim);
        }
    }
    
    /**
     * Handle submit
     */
    handleSubmit(data) {
        if (this.options.onSubmit) {
            this.options.onSubmit(data);
        } else {
            // Default: trigger form submit if textarea is in a form
            const form = this.textarea.closest('form');
            if (form) {
                const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                if (submitBtn) {
                    submitBtn.click();
                }
            }
        }
    }
    
    /**
     * Handle state changes
     */
    handleStateChange(state) {
        this.isListening = state.isListening;
        
        if (this.button) {
            if (state.isListening) {
                this.button.classList.add('listening');
                this.button.querySelector('.voice-status').textContent = 'Listening...';
            } else {
                this.button.classList.remove('listening');
                this.button.querySelector('.voice-status').textContent = '';
            }
        }
        
        // Show/hide transcript overlay for floating button
        if (this.options.style === 'floating') {
            const overlay = document.querySelector('.voice-transcript-overlay');
            if (overlay) {
                if (state.isListening || state.currentTranscript) {
                    overlay.classList.add('show');
                } else {
                    overlay.classList.remove('show');
                }
            }
        }
    }
    
    /**
     * Handle errors
     */
    handleError(error) {
        console.error('Voice input error:', error);
        
        // Show error message
        if (error.error === 'not-allowed') {
            alert('Microphone access was denied. Please allow microphone access and try again.');
        } else if (error.error === 'no-speech') {
            // Silently ignore no-speech errors
        } else {
            alert(error.message || 'An error occurred with voice input');
        }
        
        // Reset button state
        if (this.button) {
            this.button.classList.remove('listening');
        }
    }
    
    /**
     * Update transcript overlay for floating button
     */
    updateTranscriptOverlay(transcript, isInterim) {
        let overlay = document.querySelector('.voice-transcript-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'voice-transcript-overlay';
            overlay.innerHTML = '<p class="voice-transcript-text"></p>';
            document.body.appendChild(overlay);
        }
        
        const textEl = overlay.querySelector('.voice-transcript-text');
        
        if (isInterim) {
            const parts = transcript.split(' ');
            const final = parts.slice(0, -1).join(' ');
            const interim = parts[parts.length - 1];
            
            textEl.innerHTML = final + ' <span class="voice-transcript-interim">' + interim + '</span>';
        } else {
            textEl.textContent = transcript;
        }
    }
    
    /**
     * Destroy the component
     */
    destroy() {
        if (this.voiceProcessor) {
            this.voiceProcessor.destroy();
        }
        
        if (this.button) {
            this.button.removeEventListener('click', () => this.toggleVoice());
        }
        
        const overlay = document.querySelector('.voice-transcript-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
}

// Auto-initialize for easy integration
export function initVoiceButton(options) {
    const component = new VoiceButtonComponent(options);
    component.init();
    return component;
}