/**
 * Speech-to-Text Module
 * Handles browser-based speech recognition using Web Speech API
 */

export class SpeechToText {
    constructor(options = {}) {
        this.options = {
            continuous: options.continuous !== false,
            interimResults: options.interimResults !== false,
            maxAlternatives: options.maxAlternatives || 3,
            lang: options.lang || 'en-US',
            grammars: options.grammars || null,
            // Callbacks
            onStart: options.onStart || (() => {}),
            onEnd: options.onEnd || (() => {}),
            onResult: options.onResult || (() => {}),
            onError: options.onError || (() => {}),
            onNoMatch: options.onNoMatch || (() => {}),
            onSoundStart: options.onSoundStart || (() => {}),
            onSoundEnd: options.onSoundEnd || (() => {}),
            onSpeechStart: options.onSpeechStart || (() => {}),
            onSpeechEnd: options.onSpeechEnd || (() => {})
        };
        
        // Check browser support
        this.isSupported = this.checkBrowserSupport();
        
        // Recognition instance
        this.recognition = null;
        
        // State tracking
        this.isListening = false;
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.confidenceScores = [];
        
        // Performance tracking
        this.startTime = null;
        this.endTime = null;
        
        // Initialize if supported
        if (this.isSupported) {
            this.initializeRecognition();
        }
    }
    
    /**
     * Check if browser supports speech recognition
     */
    checkBrowserSupport() {
        // Check for various vendor prefixes
        const SpeechRecognition = window.SpeechRecognition || 
                                window.webkitSpeechRecognition || 
                                window.mozSpeechRecognition || 
                                window.msSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported in this browser');
            return false;
        }
        
        // Store the constructor for later use
        window.SpeechRecognitionConstructor = SpeechRecognition;
        
        // Check for mobile-specific issues
        this.checkMobileSupport();
        
        return true;
    }
    
    /**
     * Check mobile-specific support
     */
    checkMobileSupport() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            // iOS requires user interaction to start
            if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                console.info('iOS detected: Speech recognition requires user interaction to start');
                this.requiresUserInteraction = true;
            }
            
            // Android Chrome works well
            if (/Android/.test(navigator.userAgent) && /Chrome/.test(navigator.userAgent)) {
                console.info('Android Chrome detected: Full speech recognition support');
            }
        }
        
        return isMobile;
    }
    
    /**
     * Initialize speech recognition
     */
    initializeRecognition() {
        const SpeechRecognition = window.SpeechRecognitionConstructor;
        this.recognition = new SpeechRecognition();
        
        // Configure recognition
        this.recognition.continuous = this.options.continuous;
        this.recognition.interimResults = this.options.interimResults;
        this.recognition.maxAlternatives = this.options.maxAlternatives;
        this.recognition.lang = this.options.lang;
        
        // Set up grammars if provided
        if (this.options.grammars && window.SpeechGrammarList) {
            const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
            const grammarList = new SpeechGrammarList();
            grammarList.addFromString(this.options.grammars, 1);
            this.recognition.grammars = grammarList;
        }
        
        // Set up event handlers
        this.setupEventHandlers();
    }
    
    /**
     * Set up event handlers
     */
    setupEventHandlers() {
        // Start event
        this.recognition.onstart = () => {
            this.isListening = true;
            this.startTime = Date.now();
            this.finalTranscript = '';
            this.interimTranscript = '';
            this.options.onStart();
        };
        
        // End event
        this.recognition.onend = () => {
            this.isListening = false;
            this.endTime = Date.now();
            const duration = this.endTime - this.startTime;
            
            this.options.onEnd({
                finalTranscript: this.finalTranscript,
                duration,
                confidenceScores: this.confidenceScores
            });
            
            // Auto-restart if continuous mode and not manually stopped
            if (this.options.continuous && this.shouldRestart) {
                setTimeout(() => this.start(), 100);
            }
        };
        
        // Result event
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            // Process all results
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                const confidence = result[0].confidence || 0;
                
                if (result.isFinal) {
                    finalTranscript += transcript;
                    this.finalTranscript += transcript;
                    this.confidenceScores.push(confidence);
                    
                    // Get alternatives if available
                    const alternatives = [];
                    for (let j = 0; j < Math.min(result.length, this.options.maxAlternatives); j++) {
                        alternatives.push({
                            transcript: result[j].transcript,
                            confidence: result[j].confidence || 0
                        });
                    }
                    
                    this.options.onResult({
                        transcript: transcript,
                        confidence: confidence,
                        isFinal: true,
                        alternatives: alternatives,
                        fullTranscript: this.finalTranscript
                    });
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Update interim transcript
            if (interimTranscript) {
                this.interimTranscript = interimTranscript;
                
                this.options.onResult({
                    transcript: interimTranscript,
                    confidence: 0,
                    isFinal: false,
                    fullTranscript: this.finalTranscript + interimTranscript
                });
            }
        };
        
        // Error event
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Handle specific errors
            switch (event.error) {
                case 'no-speech':
                    this.options.onError({
                        error: 'no-speech',
                        message: 'No speech was detected. Please try again.'
                    });
                    break;
                case 'audio-capture':
                    this.options.onError({
                        error: 'audio-capture',
                        message: 'No microphone was found. Ensure it is connected and allowed.'
                    });
                    break;
                case 'not-allowed':
                    this.options.onError({
                        error: 'not-allowed',
                        message: 'Microphone permission was denied. Please allow microphone access.'
                    });
                    break;
                case 'network':
                    this.options.onError({
                        error: 'network',
                        message: 'Network error occurred. Please check your connection.'
                    });
                    break;
                case 'aborted':
                    // User aborted, not really an error
                    break;
                default:
                    this.options.onError({
                        error: event.error,
                        message: 'An error occurred with speech recognition.'
                    });
            }
            
            this.isListening = false;
        };
        
        // No match event
        this.recognition.onnomatch = () => {
            this.options.onNoMatch();
        };
        
        // Sound events
        this.recognition.onsoundstart = () => {
            this.options.onSoundStart();
        };
        
        this.recognition.onsoundend = () => {
            this.options.onSoundEnd();
        };
        
        // Speech events
        this.recognition.onspeechstart = () => {
            this.options.onSpeechStart();
        };
        
        this.recognition.onspeechend = () => {
            this.options.onSpeechEnd();
        };
    }
    
    /**
     * Start speech recognition
     */
    async start() {
        if (!this.isSupported) {
            throw new Error('Speech recognition not supported');
        }
        
        if (this.isListening) {
            console.warn('Already listening');
            return;
        }
        
        // Reset state
        this.shouldRestart = true;
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.confidenceScores = [];
        
        try {
            // Request microphone permission if needed
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            // Start recognition
            this.recognition.start();
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            this.options.onError({
                error: 'start-failed',
                message: 'Failed to start speech recognition',
                details: error.message
            });
            throw error;
        }
    }
    
    /**
     * Stop speech recognition
     */
    stop() {
        if (!this.isListening) {
            return;
        }
        
        this.shouldRestart = false;
        this.recognition.stop();
    }
    
    /**
     * Abort speech recognition (immediate stop)
     */
    abort() {
        if (!this.isListening) {
            return;
        }
        
        this.shouldRestart = false;
        this.recognition.abort();
    }
    
    /**
     * Change language
     */
    setLanguage(lang) {
        this.options.lang = lang;
        if (this.recognition) {
            this.recognition.lang = lang;
        }
    }
    
    /**
     * Get supported languages
     */
    static getSupportedLanguages() {
        return [
            { code: 'en-US', name: 'English (US)' },
            { code: 'en-GB', name: 'English (UK)' },
            { code: 'es-ES', name: 'Spanish (Spain)' },
            { code: 'es-MX', name: 'Spanish (Mexico)' },
            { code: 'fr-FR', name: 'French' },
            { code: 'de-DE', name: 'German' },
            { code: 'it-IT', name: 'Italian' },
            { code: 'pt-BR', name: 'Portuguese (Brazil)' },
            { code: 'pt-PT', name: 'Portuguese (Portugal)' },
            { code: 'ru-RU', name: 'Russian' },
            { code: 'ja-JP', name: 'Japanese' },
            { code: 'ko-KR', name: 'Korean' },
            { code: 'zh-CN', name: 'Chinese (Simplified)' },
            { code: 'zh-TW', name: 'Chinese (Traditional)' },
            { code: 'ar-SA', name: 'Arabic' },
            { code: 'hi-IN', name: 'Hindi' },
            { code: 'nl-NL', name: 'Dutch' },
            { code: 'pl-PL', name: 'Polish' },
            { code: 'tr-TR', name: 'Turkish' },
            { code: 'sv-SE', name: 'Swedish' }
        ];
    }
    
    /**
     * Get recognition state
     */
    getState() {
        return {
            isSupported: this.isSupported,
            isListening: this.isListening,
            finalTranscript: this.finalTranscript,
            interimTranscript: this.interimTranscript,
            language: this.options.lang,
            continuous: this.options.continuous,
            confidenceAverage: this.confidenceScores.length > 0 
                ? this.confidenceScores.reduce((a, b) => a + b, 0) / this.confidenceScores.length 
                : 0
        };
    }
    
    /**
     * Destroy and clean up
     */
    destroy() {
        if (this.recognition) {
            this.abort();
            this.recognition = null;
        }
    }
}

// Helper function to check browser compatibility
export function checkSpeechRecognitionSupport() {
    const support = {
        supported: false,
        vendor: null,
        requiresPrefix: false,
        mobile: false,
        notes: []
    };
    
    // Check for API support
    if (window.SpeechRecognition) {
        support.supported = true;
        support.vendor = 'standard';
    } else if (window.webkitSpeechRecognition) {
        support.supported = true;
        support.vendor = 'webkit';
        support.requiresPrefix = true;
        support.notes.push('Requires webkit prefix');
    }
    
    // Check if mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    support.mobile = isMobile;
    
    // Browser-specific notes
    if (navigator.userAgent.includes('Chrome')) {
        support.notes.push('Full support in Chrome');
    } else if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
        support.notes.push('Limited support in Safari - may require user interaction');
    } else if (navigator.userAgent.includes('Firefox')) {
        support.supported = false;
        support.notes.push('Not supported in Firefox - use Chrome or Safari');
    }
    
    return support;
}