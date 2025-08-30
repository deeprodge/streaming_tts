

class TTSWebSocketClient {
    constructor() {
        console.log('🚀 TTSWebSocketClient constructor called');
        
        this.ws = null;
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.currentSource = null;
        this.sentTextLength = 0;
        this.volume = 0.7;
        
        // Track full text for captions
        this.fullText = '';
        this.processedTextLength = 0;
        
        // Highlighting system
        this.highlightingData = [];
        this.highlightingTimer = null;
        this.currentHighlightIndex = 0;
        this.audioChunkStartTime = null;
        this.globalStartTime = null;
        this.isHighlightingActive = false;
        this.wordElements = [];
        
        // Text input debouncing
        this.inputTimeout = null;
        this.isNewSession = true;  // Track if this is a new typing session
        
        // Audio playback tracking
        this.audioStartTime = null;
        
        // Streaming TTS progress tracking
        this.streamingChunks = [];
        this.currentChunkIndex = 0;
        this.totalEstimatedDuration = 0;
        this.streamingMode = false;
        
        // Statistics
        this.stats = {
            charCount: 0,
            chunkCount: 0,
            latencies: [],
            sessionStart: Date.now()
        };
        
        // Timing for latency measurement (first text chunk to first audio sent)
        this.firstChunkSentTime = null;
        this.firstAudioReceived = false;
        this.exampleClickTime = null; // For measuring example button click to first audio
        
        // Initialize DOM elements
        try {
            this.initializeElements();
        } catch (error) {
            console.error('❌ Element initialization failed:', error);
        }
        
        try {
            this.initializeEventListeners();
        } catch (error) {
            console.error('❌ Event listener initialization failed:', error);
        }
        
        try {
            this.initializeWebSocket();
        } catch (error) {
            console.error('❌ WebSocket initialization failed:', error);
        }
        
        try {
            this.initializeAudio();
        } catch (error) {
            console.error('❌ Audio initialization failed:', error);
        }
        
        try {
            this.startStatsUpdater();
        } catch (error) {
            console.error('❌ Stats updater failed:', error);
        }
    }
    
    initializeElements() {
        // Input elements
        this.textInput = document.getElementById('textInput');
        
        // New control buttons
        this.enableLiveButton = document.getElementById('enableLiveButton');
        this.flushButton = document.getElementById('flushButton');
        this.convertButton = document.getElementById('convertButton');
        this.stopAllButton = document.getElementById('stopAllButton');
        
        // Status elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.audioQueueCount = document.getElementById('audioQueueCount');
        this.latencyDisplay = document.getElementById('latencyDisplay');
        
        // Caption elements
        this.captionDisplay = document.getElementById('captionDisplay');
        
        // Audio control elements (simplified)
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        
        // Progress bar elements
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('audioProgress');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressTime = document.getElementById('progressTime');
        
        // Statistics elements
        this.charCountEl = document.getElementById('charCount');
        this.chunkCountEl = document.getElementById('chunkCount');
        this.avgLatencyEl = document.getElementById('avgLatency');
        this.sessionDurationEl = document.getElementById('sessionDuration');
        
        // Debug log
        this.debugLog = document.getElementById('debugLog');
        
        // Chunking control
        this.chunkSizeInput = document.getElementById('chunkSizeInput');
        
        // Modal elements (removed mathModal and mathHelpButton references)
        // this.mathModal = document.getElementById('mathModal');
        // this.mathHelpButton = document.getElementById('mathHelpButton');
        this.closeModalButton = document.querySelector('.close');
        
        // Mode tracking
        this.isLiveMode = false;
    }
    
    initializeEventListeners() {
        // Text input events - conditional based on mode
        this.textInput.addEventListener('input', this.onTextInput.bind(this));
        
        // Example buttons events
        this.initializeExampleButtons();
        
        // New control button events
        this.enableLiveButton.addEventListener('click', this.toggleLiveMode.bind(this));
        this.flushButton.addEventListener('click', this.flushText.bind(this));
        this.convertButton.addEventListener('click', this.convertToSpeech.bind(this));
        this.stopAllButton.addEventListener('click', this.stopAllAndClear.bind(this));
        
        // Audio control events (simplified)
        this.volumeSlider.addEventListener('input', this.onVolumeChange.bind(this));
        
        // Chunking control events
        if (this.chunkSizeInput) {
            this.chunkSizeInput.addEventListener('input', this.onChunkSizeChange.bind(this));
        }
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    initializeWebSocket() {
        this.log('Initializing WebSocket connection...');
        this.log(`Current location: ${window.location.href}`);
        this.log(`Protocol: ${window.location.protocol}, Host: ${window.location.host}`);
        
        // Clean up any existing connection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        try {
            // Build WebSocket URL
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            
            this.log(`Connecting to: ${wsUrl}`);
            this.updateConnectionStatus('connecting');
            
            // Create WebSocket connection
            this.ws = new WebSocket(wsUrl);
            
            // Set up event handlers
            this.ws.onopen = this.handleWebSocketOpen.bind(this);
            this.ws.onmessage = this.handleWebSocketMessage.bind(this);
            this.ws.onclose = this.handleWebSocketClose.bind(this);
            this.ws.onerror = this.handleWebSocketError.bind(this);
            
            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    this.log('Connection timeout - closing WebSocket');
                    this.ws.close();
                }
            }, 10000);
            
        } catch (error) {
            this.log(`Failed to create WebSocket: ${error.message}`);
            this.updateConnectionStatus('disconnected');
        }
    }
    
    handleWebSocketOpen(event) {
        this.log('✅ WebSocket connected successfully');
        
        // Clear timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        this.updateConnectionStatus('connected');
        
        // Initialize session with server using proper protocol
        // According to WebSocket protocol: first chunk should be " " (single space)
        this.log('Sending session initialization message...');
        const success = this.sendWebSocketMessage({text: ' '});
        if (!success) {
            this.log('❌ Failed to send initialization message');
        }
    }
    
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            this.log(`📥 Received: ${data.audio ? 'audio+alignment' : JSON.stringify(data).substring(0, 50)}`);
            
            // Handle server errors
            if (data.error) {
                this.log(`Server error: ${data.error}`);
                return;
            }
            
            // Process audio message
            if (data.audio && data.alignment) {
                this.processAudioMessage(data);
            }
            
        } catch (error) {
            this.log(`Message processing error: ${error.message}`);
            // Don't close connection on message errors
        }
    }
    
    handleWebSocketClose(event) {
        this.log(`🔌 WebSocket closed: ${event.code} ${event.reason || 'No reason'}`);
        this.log(`Was clean: ${event.wasClean}`);
        
        // Log common close codes for debugging
        const closeCodes = {
            1000: 'Normal Closure',
            1001: 'Going Away', 
            1002: 'Protocol Error',
            1003: 'Unsupported Data',
            1006: 'Abnormal Closure',
            1011: 'Internal Error',
            1015: 'TLS Handshake'
        };
        
        if (closeCodes[event.code]) {
            this.log(`Close reason: ${closeCodes[event.code]}`);
        }
        
        // Clear timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        this.updateConnectionStatus('disconnected');
        
        // Reconnect if not a clean close
        if (event.code !== 1000) {
            this.log('Reconnecting in 3 seconds...');
            setTimeout(() => {
                this.initializeWebSocket();
            }, 3000);
        }
    }
    
    handleWebSocketError(event) {
        this.log(`❌ WebSocket error occurred:`);
        this.log(`Error event:`, event);
        if (event.error) {
            this.log(`Error details: ${event.error}`);
        }
        if (this.ws) {
            this.log(`WebSocket readyState: ${this.ws.readyState}`);
            this.log(`WebSocket URL: ${this.ws.url}`);
        }
        this.updateConnectionStatus('disconnected');
    }
    
    sendWebSocketMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                const jsonMessage = JSON.stringify(message);
                this.ws.send(jsonMessage);
                this.log(`📤 Sent: ${jsonMessage.substring(0, 50)}${jsonMessage.length > 50 ? '...' : ''}`);
                return true;
            } catch (error) {
                this.log(`Send error: ${error.message}`);
                return false;
            }
        } else {
            this.log(`Cannot send - WebSocket state: ${this.ws ? this.ws.readyState : 'null'}`);
            return false;
        }
    }
    
    async initializeAudio() {
        try {
            this.log('Starting Web Audio API initialization...');
            
            // Check if Web Audio API is available
            if (!window.AudioContext && !window.webkitAudioContext) {
                throw new Error('Web Audio API not supported in this browser');
            }
            
            // Initialize Web Audio API
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log(`AudioContext created, state: ${this.audioContext.state}`);
            
            // Handle suspended audio context (required by browsers for user interaction)
            if (this.audioContext.state === 'suspended') {
                this.log('AudioContext suspended - will resume on first user interaction');
                // Add click listener to resume audio context
                const resumeAudio = async () => {
                    try {
                        if (this.audioContext.state === 'suspended') {
                            await this.audioContext.resume();
                            this.log(`AudioContext resumed, state: ${this.audioContext.state}`);
                        }
                    } catch (error) {
                        this.log(`Failed to resume AudioContext: ${error.message}`);
                    }
                    document.removeEventListener('click', resumeAudio);
                };
                document.addEventListener('click', resumeAudio);
            }
            
            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = this.volume;
            
            this.log('Audio system initialized successfully');
        } catch (error) {
            this.log(`Audio initialization failed: ${error.message}`);
            this.log('Continuing without audio context...');
            // Set audioContext to null so other functions can check
            this.audioContext = null;
        }
    }
    
    processAudioMessage(data) {
        try {
            // Update statistics
            this.stats.chunkCount++;
            
            // Record latency for first audio
            if (this.firstChunkSentTime && !this.firstAudioReceived) {
                const latency = performance.now() - this.firstChunkSentTime;
                this.stats.latencies.push(latency);
                if (this.latencyDisplay) {
                    this.latencyDisplay.textContent = `${Math.round(latency)}ms`;
                }
                this.firstAudioReceived = true;
            }
            
            // Process highlighting data
            if (data.word_alignment) {
                this.processHighlightingData(data);
            }
            
            // Queue audio for playback
            if (data.audio) {
                this.queueAudioForPlayback(data.audio, data);
            }
            
            // Update captions with highlighting
            if (data.full_text || data.processed_text) {
                this.updateCaptionsWithHighlighting(data.full_text || data.processed_text || '', data);
            }
            
            // Update UI
            this.updateAudioQueueCount();
            
        } catch (error) {
            this.log(`Audio processing error: ${error.message}`);
        }
    }
    
    processHighlightingData(data) {
        /**
         * Process word alignment data for highlighting
         * Accumulates timing data across multiple audio chunks with improved sync
         */
        try {
            if (!data.word_alignment) return;
            
            const wordAlignment = data.word_alignment;
            const words = wordAlignment.words || [];
            const startTimes = wordAlignment.word_start_times_ms || [];
            const durations = wordAlignment.word_durations_ms || [];
            
            // Calculate cumulative offset for this chunk
            const cumulativeOffset = this.highlightingData.reduce((total, chunk) => {
                return total + chunk.totalDuration;
            }, 0);
            
            // Calculate total duration for this chunk
            const chunkDuration = startTimes.length > 0 ? 
                (startTimes[startTimes.length - 1] + durations[durations.length - 1]) : 0;
            
            // Store highlighting data for this chunk with improved timing
            const chunkData = {
                words: words,
                startTimes: startTimes.map(time => time + cumulativeOffset),
                durations: durations,
                totalDuration: chunkDuration,
                originalText: data.original_text || '',
                processedText: data.processed_text || '',
                chunkIndex: this.highlightingData.length // Track chunk sequence
            };
            
            this.highlightingData.push(chunkData);
            
            this.log(`Highlighting data processed: ${words.length} words, chunk duration: ${chunkDuration}ms, cumulative offset: ${cumulativeOffset}ms`);
            
        } catch (error) {
            this.log(`Error processing highlighting data: ${error.message}`);
        }
    }
    
    updateCaptionsWithHighlighting(text, data) {
        /**
         * Update captions with word-level spans for highlighting
         */
        try {
            // Clear placeholder only once at the start
            if (this.captionDisplay.querySelector('.placeholder')) {
                this.captionDisplay.innerHTML = '';
                this.log('Cleared placeholder for first caption chunk');
            }
            
            this.log(`Updating captions with highlighting: "${text}"`);
            
            // Preserve existing highlighting states before rebuilding
            const existingStates = this.preserveHighlightingStates();
            
            // Clear and rebuild caption display
            this.captionDisplay.innerHTML = '';
            
            // Create word spans from accumulated highlighting data
            this.createWordSpans(text);
            
            // Restore preserved highlighting states
            this.restoreHighlightingStates(existingStates);
            
            // Update processed text length
            this.processedTextLength = text.length;
            
        } catch (error) {
            this.log(`Error updating captions with highlighting: ${error.message}`);
            // Fallback to simple text display
            this.updateCaptions(text);
        }
    }
    
    createWordSpans(fullText) {
        /**
         * Create individual word spans for highlighting
         */
        try {
            const container = document.createElement('div');
            container.className = 'caption-text';
            
            // Flatten all words from all chunks
            const allWords = [];
            const allStartTimes = [];
            const allDurations = [];
            
            for (const chunk of this.highlightingData) {
                for (let i = 0; i < chunk.words.length; i++) {
                    allWords.push(chunk.words[i]);
                    allStartTimes.push(chunk.startTimes[i]);
                    allDurations.push(chunk.durations[i]);
                }
            }
            
            // Clear word elements array
            this.wordElements = [];
            
            // Create spans for each word
            for (let i = 0; i < allWords.length; i++) {
                const wordSpan = document.createElement('span');
                wordSpan.className = 'word-highlight';
                wordSpan.textContent = allWords[i];
                wordSpan.dataset.wordIndex = i;
                wordSpan.dataset.startTime = allStartTimes[i];
                wordSpan.dataset.duration = allDurations[i];
                
                container.appendChild(wordSpan);
                this.wordElements.push(wordSpan);
                
                // Add space after word (except last)
                if (i < allWords.length - 1) {
                    container.appendChild(document.createTextNode(' '));
                }
            }
            
            this.captionDisplay.appendChild(container);
            
            this.log(`Created ${allWords.length} word spans for highlighting`);
            
        } catch (error) {
            this.log(`Error creating word spans: ${error.message}`);
            // Fallback to simple text display
            const textSpan = document.createElement('span');
            textSpan.className = 'caption-text';
            textSpan.textContent = fullText;
            this.captionDisplay.appendChild(textSpan);
        }
    }
    
    preserveHighlightingStates() {
        /**
         * Preserve current highlighting states before DOM rebuild
         */
        try {
            const states = [];
            const wordElements = this.captionDisplay.querySelectorAll('.word-highlight');
            
            wordElements.forEach((element, index) => {
                states.push({
                    index: index,
                    wordText: element.textContent,
                    classList: Array.from(element.classList),
                    startTime: element.dataset.startTime,
                    duration: element.dataset.duration
                });
            });
            
            this.log(`Preserved highlighting states for ${states.length} words`);
            return states;
            
        } catch (error) {
            this.log(`Error preserving highlighting states: ${error.message}`);
            return [];
        }
    }
    
    restoreHighlightingStates(existingStates) {
        /**
         * Restore highlighting states after DOM rebuild
         */
        try {
            if (!existingStates || existingStates.length === 0) {
                return;
            }
            
            const newWordElements = this.captionDisplay.querySelectorAll('.word-highlight');
            
            existingStates.forEach(state => {
                // Find corresponding word element by text content and position
                if (state.index < newWordElements.length) {
                    const wordElement = newWordElements[state.index];
                    
                    // Verify word text matches (accounting for processing changes)
                    if (wordElement && wordElement.textContent === state.wordText) {
                        // Restore CSS classes (excluding base 'word-highlight' class)
                        state.classList.forEach(className => {
                            if (className !== 'word-highlight') {
                                wordElement.classList.add(className);
                            }
                        });
                    }
                }
            });
            
            this.log(`Restored highlighting states for ${existingStates.length} words`);
            
        } catch (error) {
            this.log(`Error restoring highlighting states: ${error.message}`);
        }
    }
    
    startHighlighting() {
        /**
         * Start the highlighting process synchronized with audio playback
         * In live typing mode, continues from where highlighting left off
         */
        try {
            if (this.wordElements.length === 0) {
                this.log('No word elements available for highlighting');
                return;
            }
            
            // Check if highlighting is already active (live typing continuation)
            if (this.isHighlightingActive) {
                this.log('Highlighting already active - continuing from current position');
                return;
            }
            
            this.isHighlightingActive = true;
            
            // In live typing mode, find the appropriate starting index
            if (this.isLiveMode) {
                // Find the first word that hasn't been spoken yet
                let continueFromIndex = 0;
                for (let i = 0; i < this.wordElements.length; i++) {
                    const wordElement = this.wordElements[i];
                    if (!wordElement.classList.contains('spoken')) {
                        continueFromIndex = i;
                        break;
                    }
                }
                this.currentHighlightIndex = continueFromIndex;
                this.log(`Live typing mode: continuing highlighting from word ${continueFromIndex + 1}`);
            } else {
                // Standard mode: start from beginning
                this.currentHighlightIndex = 0;
                this.log('Standard mode: starting highlighting from beginning');
            }
            
            // Use audio context time for better synchronization
            if (this.audioContext && this.audioStartTime) {
                // Sync with actual audio playback time
                this.globalStartTime = performance.now() - (this.audioContext.currentTime * 1000 - this.audioStartTime);
            } else {
                // Fallback to current time
                this.globalStartTime = performance.now();
            }
            
            this.log(`Starting highlighting for ${this.wordElements.length} words with improved sync`);
            
            // Start highlighting timer
            this.scheduleNextHighlight();
            
        } catch (error) {
            this.log(`Error starting highlighting: ${error.message}`);
        }
    }
    
    scheduleNextHighlight() {
        /**
         * Schedule the next word to be highlighted
         * Handles live typing mode timing continuation
         */
        try {
            if (!this.isHighlightingActive || this.currentHighlightIndex >= this.wordElements.length) {
                this.stopHighlighting();
                return;
            }
            
            const currentWord = this.wordElements[this.currentHighlightIndex];
            const startTime = parseFloat(currentWord.dataset.startTime);
            const duration = parseFloat(currentWord.dataset.duration);
            
            const currentTime = performance.now() - this.globalStartTime;
            
            // In live typing mode, calculate relative timing for continuation
            let timeToHighlight;
            if (this.isLiveMode && this.currentHighlightIndex > 0) {
                // Find the last spoken word to calculate elapsed time
                let elapsedSpeechTime = 0;
                for (let i = 0; i < this.currentHighlightIndex; i++) {
                    const prevWord = this.wordElements[i];
                    if (prevWord && prevWord.classList.contains('spoken')) {
                        const prevStartTime = parseFloat(prevWord.dataset.startTime);
                        const prevDuration = parseFloat(prevWord.dataset.duration);
                        elapsedSpeechTime = Math.max(elapsedSpeechTime, prevStartTime + prevDuration);
                    }
                }
                
                // Calculate timing relative to current audio chunk
                const relativeStartTime = startTime - elapsedSpeechTime;
                timeToHighlight = Math.max(0, relativeStartTime);
                
                this.log(`Live mode: word ${this.currentHighlightIndex + 1} timing - elapsed: ${elapsedSpeechTime}ms, relative: ${relativeStartTime}ms`);
            } else {
                // Standard timing calculation
                timeToHighlight = Math.max(0, startTime - currentTime);
            }
            
            // Schedule highlight
            this.highlightingTimer = setTimeout(() => {
                this.highlightWord(this.currentHighlightIndex, duration);
                this.currentHighlightIndex++;
                this.scheduleNextHighlight();
            }, timeToHighlight);
            
        } catch (error) {
            this.log(`Error scheduling highlight: ${error.message}`);
        }
    }
    
    highlightWord(index, duration) {
        /**
         * Highlight a specific word
         */
        try {
            // Remove previous highlighting
            this.wordElements.forEach(element => {
                element.classList.remove('highlighted', 'speaking');
            });
            
            if (index < this.wordElements.length) {
                const wordElement = this.wordElements[index];
                wordElement.classList.add('highlighted', 'speaking');
                
                // Remove highlighting after duration
                setTimeout(() => {
                    if (wordElement) {
                        wordElement.classList.remove('speaking');
                        wordElement.classList.add('spoken');
                    }
                }, duration);
                
                // Scroll into view if needed
                this.scrollToHighlightedWord(wordElement);
                
                this.log(`Highlighting word ${index + 1}/${this.wordElements.length}: "${wordElement.textContent}"`);
            }
            
        } catch (error) {
            this.log(`Error highlighting word: ${error.message}`);
        }
    }
    
    scrollToHighlightedWord(wordElement) {
        /**
         * Scroll caption display to keep highlighted word visible
         */
        try {
            const captionRect = this.captionDisplay.getBoundingClientRect();
            const wordRect = wordElement.getBoundingClientRect();
            
            // Check if word is outside visible area
            if (wordRect.bottom > captionRect.bottom || wordRect.top < captionRect.top) {
                wordElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }
        } catch (error) {
            this.log(`Error scrolling to highlighted word: ${error.message}`);
        }
    }
    
    stopHighlighting() {
        /**
         * Stop the highlighting process
         * In live typing mode, preserves position for continuation
         */
        try {
            this.isHighlightingActive = false;
            
            // Only reset index in non-live mode or when explicitly resetting
            if (!this.isLiveMode) {
                this.currentHighlightIndex = 0;
                this.log('Highlighting stopped - index reset for non-live mode');
            } else {
                this.log(`Highlighting paused - preserving index ${this.currentHighlightIndex} for live mode continuation`);
            }
            
            if (this.highlightingTimer) {
                clearTimeout(this.highlightingTimer);
                this.highlightingTimer = null;
            }
            
            // Only remove active highlighting classes, preserve 'spoken' state
            this.wordElements.forEach(element => {
                element.classList.remove('highlighted', 'speaking');
                // Keep 'spoken' class to maintain green highlighting for completed words
            });
            
            this.log('Highlighting stopped - preserving spoken word indicators');
            
        } catch (error) {
            this.log(`Error stopping highlighting: ${error.message}`);
        }
    }
    
    resetHighlighting() {
        /**
         * Reset highlighting data and state (force reset)
         */
        try {
            this.stopHighlighting();
            
            // Force reset index regardless of mode
            this.currentHighlightIndex = 0;
            
            // Clear all highlighting classes for reset (including 'spoken')
            this.wordElements.forEach(element => {
                element.classList.remove('highlighted', 'speaking', 'spoken');
            });
            
            this.highlightingData = [];
            this.wordElements = [];
            this.globalStartTime = null;
            
            this.log('Highlighting system reset - forced index reset');
            
        } catch (error) {
            this.log(`Error resetting highlighting: ${error.message}`);
        }
    }
    
    // Character-based captions removed - using simple text display
    
    initializeExampleButtons() {
        // Get all example buttons
        const exampleButtons = document.querySelectorAll('.example-btn');
        
        exampleButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                this.handleExampleClick(event.target);
            });
        });
    }
    
    handleExampleClick(button) {
        const text = button.getAttribute('data-text');
        const category = button.closest('.example-category').querySelector('h4').textContent;
        
        this.log(`Example selected: ${category} - "${text.substring(0, 30)}..."`);
        
        // Add loading state to button
        button.classList.add('loading');
        
        // Ensure we're not in streaming mode for examples
        this.streamingMode = false;
        
        // Clear current text and set new text
        this.textInput.value = text;
        this.sentTextLength = 0;
        this.stats.charCount = text.length;
        
        // Clear existing captions and reset server session
        this.captionDisplay.innerHTML = '';
        this.processedTextLength = 0;
        this.fullText = text;
        
        // Reset highlighting system
        this.resetHighlighting();
        
        // IMPORTANT: Send reset to server to clear accumulated text
        this.sendWebSocketMessage({reset: true});
        this.log('Example clicked - server session reset');
        
        // Start latency measurement from example button click
        this.exampleClickTime = performance.now();
        
        // Send the text for TTS processing
        this.sendExampleText(text).finally(() => {
            // Remove loading state
            button.classList.remove('loading');
        });
    }
    
    async sendExampleText(text) {
        try {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.log('WebSocket not connected, cannot send example text');
                return;
            }
            
            this.log(`Sending example text: "${text}"`);
            this.fullText = text;
            this.processedTextLength = 0;
            
            // Reset latency tracking
            this.firstChunkSentTime = performance.now();
            this.firstAudioReceived = false;
            
            // Send text as a single chunk to prevent fragmented processing
            // This ensures proper caption display for example texts
            this.sendWebSocketMessage({text: text});
            this.sentTextLength = text.length;
            
            // Force flush to complete the processing
            this.sendWebSocketMessage({flush: true});
            
        } catch (error) {
            this.log(`Error sending example text: ${error.message}`);
        }
    }
    
    onTextInput(event) {
        // Only process input in live mode
        if (!this.isLiveMode) {
            return;
        }
        
        const currentText = this.textInput.value;
        
        // If this is a completely new input (user cleared and started fresh)
        if (this.sentTextLength === 0 && currentText.length > 0) {
            this.isNewSession = true;
            // Clear previous captions for new session
            this.captionDisplay.innerHTML = '';
            this.processedTextLength = 0;
            this.fullText = '';
            // Reset highlighting system for new session
            this.resetHighlighting();
            // Signal server to reset session
            this.sendWebSocketMessage({reset: true});
            this.log('New typing session started - captions cleared');
        }
        
        const newText = currentText.substring(this.sentTextLength);
        
        if (newText) {
            // Track first chunk for latency measurement
            if (!this.firstChunkSentTime) {
                this.firstChunkSentTime = performance.now();
                this.firstAudioReceived = false;
            }
            
            // Clear any existing timeout
            if (this.inputTimeout) {
                clearTimeout(this.inputTimeout);
            }
            
            // In live mode, check for sentence endings (!, ?, .) for immediate TTS
            // Use intelligent sentence detection that ignores abbreviations
            const hasSentenceEnd = this.hasTrueSentenceEnding(currentText.trim());
            
            if (hasSentenceEnd) {
                // Send immediately on sentence completion
                this.sendWebSocketMessage({text: newText});
                this.sendWebSocketMessage({flush: true});
                this.sentTextLength = currentText.length;
                this.stats.charCount = currentText.length;
                this.fullText = currentText;
                this.isNewSession = false;
                this.log('Sentence completed - immediate TTS triggered');
            } else {
                // Use debounced sending for partial sentences
                this.inputTimeout = setTimeout(() => {
                    if (this.textInput.value.substring(this.sentTextLength)) {
                        const pendingText = this.textInput.value.substring(this.sentTextLength);
                        this.sendWebSocketMessage({text: pendingText});
                        this.sentTextLength = this.textInput.value.length;
                        this.stats.charCount = this.textInput.value.length;
                        this.fullText = this.textInput.value;
                        this.isNewSession = false;
                    }
                }, 500); // Longer debounce in live mode
                
                // For immediate feedback, send longer chunks right away
                // But avoid sending single spaces that cause TTS fragmentation
                if ((newText.length >= 8 || (newText.includes(' ') && newText.trim().length > 0)) && newText.trim() !== '') {
                    clearTimeout(this.inputTimeout);
                    this.sendWebSocketMessage({text: newText});
                    this.sentTextLength = currentText.length;
                    this.stats.charCount = currentText.length;
                    this.fullText = currentText;
                    this.isNewSession = false;
                }
            }
        }
    }
    
    hasTrueSentenceEnding(text) {
        // Check for true sentence endings, ignoring common abbreviations
        
        // Common abbreviations that should NOT trigger sentence processing
        const abbreviations = [
            // Titles
            /\bMr\./gi,
            /\bMrs\./gi,
            /\bMs\./gi,
            /\bDr\./gi,
            /\bProf\./gi,
            /\bRev\./gi,
            /\bSt\./gi,
            /\bMt\./gi,
            
            // Name suffixes
            /\bJr\./gi,
            /\bSr\./gi,
            /\bII\./gi,
            /\bIII\./gi,
            
            // Academic/Professional
            /\bPhD\./gi,
            /\bMD\./gi,
            /\bLLD\./gi,
            /\bBA\./gi,
            /\bBS\./gi,
            /\bMA\./gi,
            /\bMS\./gi,
            
            // Common abbreviations
            /\betc\./gi,
            /\bvs\./gi,
            /\be\.g\./gi,
            /\bi\.e\./gi,
            /\bInc\./gi,
            /\bCorp\./gi,
            /\bLtd\./gi,
            /\bCo\./gi,
            /\bLLC\./gi,
            
            // Geographic
            /\bU\.S\./gi,
            /\bU\.K\./gi,
            /\bN\.Y\./gi,
            /\bL\.A\./gi,
            /\bD\.C\./gi,
            
            // Time/Date
            /\ba\.m\./gi,
            /\bp\.m\./gi,
            /\bA\.M\./gi,
            /\bP\.M\./gi,
            
            // Units/Measurements
            /\bin\./gi,
            /\bft\./gi,
            /\blb\./gi,
            /\boz\./gi,
            /\bgal\./gi,
            /\bmin\./gi,
            /\bsec\./gi,
            /\bmax\./gi,
        ];
        
        // Remove abbreviations from text temporarily
        let textWithoutAbbrevs = text;
        abbreviations.forEach(abbrevRegex => {
            textWithoutAbbrevs = textWithoutAbbrevs.replace(abbrevRegex, 'ABBREV');
        });
        
        // Now check for real sentence endings at the end of text
        return /[.!?]\s*$/.test(textWithoutAbbrevs);
    }
    
    flushText() {
        this.log('Flushing current text buffer');
        
        // First, send any remaining text that hasn't been sent yet
        const currentText = this.textInput.value;
        const remainingText = currentText.substring(this.sentTextLength);
        
        if (remainingText.trim()) {
            this.log(`Sending remaining text before flush: "${remainingText}"`);
            this.sendWebSocketMessage({text: remainingText});
            this.sentTextLength = currentText.length;
            this.stats.charCount = currentText.length;
            this.fullText = currentText;
        }
        
        // Then flush to process all buffered text
        this.sendWebSocketMessage({flush: true});
    }
    
    toggleLiveMode() {
        this.isLiveMode = !this.isLiveMode;
        
        if (this.isLiveMode) {
            this.enableLiveButton.textContent = 'Disable Live Typing';
            this.enableLiveButton.className = 'btn btn-danger';
            this.log('Live typing mode enabled - TTS on sentence completion');
        } else {
            this.enableLiveButton.textContent = 'Enable Live Typing';
            this.enableLiveButton.className = 'btn btn-primary';
            // Reset highlighting when disabling live mode
            this.resetHighlighting();
            this.log('Live typing mode disabled - highlighting reset');
        }
    }
    
    intelligentTextChunking(text, maxWordsPerChunk = 20) {
        // Text chunking for streaming TTS - creates meaningful chunks up to maxWordsPerChunk
        const chunks = [];
        
        // Split by true sentence endings (ignoring abbreviations)
        const sentences = this.splitIntoSentences(text);
        
        for (const sentence of sentences) {
            const words = sentence.split(/\s+/).filter(word => word.length > 0);
            
            // If sentence is short enough, keep it as one chunk
            if (words.length <= maxWordsPerChunk) {
                chunks.push(sentence.trim());
            } else {
                // Split longer sentences into word-based chunks
                for (let i = 0; i < words.length; i += maxWordsPerChunk) {
                    const chunk = words.slice(i, i + maxWordsPerChunk).join(' ');
                    chunks.push(chunk);
                }
            }
        }
        
        return chunks.filter(chunk => chunk.length > 0);
    }
    
    splitIntoSentences(text) {
        // Split text into sentences while respecting abbreviations
        const sentences = [];
        let currentSentence = '';
        
        // Split by potential sentence endings
        const parts = text.split(/([.!?])\s+/);
        
        for (let i = 0; i < parts.length; i += 2) {
            const textPart = parts[i] || '';
            const punctuation = parts[i + 1] || '';
            
            currentSentence += textPart + punctuation;
            
            // Check if this is a true sentence ending
            if (punctuation && this.hasTrueSentenceEnding(currentSentence)) {
                sentences.push(currentSentence.trim());
                currentSentence = '';
            }
        }
        
        // Add any remaining text
        if (currentSentence.trim()) {
            sentences.push(currentSentence.trim());
        }
        
        return sentences.filter(sentence => sentence.length > 0);
    }
    
    estimateAudioDuration(text) {
        // Estimate total audio duration for progress tracking
        // Rough estimation: ~150ms per character (based on typical TTS speed)
        return text.length * 150; // milliseconds
    }
    
    updateProgressBar(current, total) {
        // Update audio progress bar
        if (this.progressContainer && this.progressBar && total > 0) {
            // Show progress bar when streaming starts
            this.progressContainer.style.display = 'block';
            
            const percentage = Math.min((current / total) * 100, 100);
            this.progressBar.style.width = `${percentage}%`;
            
            if (this.progressPercent) {
                this.progressPercent.textContent = `${Math.round(percentage)}%`;
            }
            
            if (this.progressTime) {
                const currentSec = Math.round(current / 1000);
                const totalSec = Math.round(total / 1000);
                this.progressTime.textContent = `${currentSec}s / ${totalSec}s`;
            }
        } else if (total === 0 && this.progressContainer) {
            // Hide progress bar when done
            this.progressContainer.style.display = 'none';
        }
    }
    
    convertToSpeech() {
        const text = this.textInput.value.trim();
        if (!text) {
            this.log('No text to convert');
            return;
        }
        
        this.log(`Starting streaming TTS for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        // Enter streaming mode
        this.streamingMode = true;
        
        // Clear previous state and reset server session
        this.captionDisplay.innerHTML = '';
        this.processedTextLength = 0;
        this.fullText = text;
        
        // Reset highlighting system
        this.resetHighlighting();
        
        this.sendWebSocketMessage({reset: true});
        
        // Reset tracking
        this.sentTextLength = 0;
        this.firstChunkSentTime = performance.now();
        this.firstAudioReceived = false;
        this.currentChunkIndex = 0;
        
        // Smart chunking for fast streaming - configurable chunk size
        const chunkSize = parseInt(this.chunkSizeInput?.value || '20', 10);
        this.streamingChunks = this.intelligentTextChunking(text, chunkSize);
        this.totalEstimatedDuration = this.estimateAudioDuration(text);
        
        this.log(`Text chunked into ${this.streamingChunks.length} pieces: [${this.streamingChunks.map(c => `"${c}"`).join(', ')}]`);
        
        // Initialize progress bar
        this.updateProgressBar(0, this.totalEstimatedDuration);
        
        // Start streaming immediately with first chunk
        this.streamNextChunk();
    }
    
    streamNextChunk() {
        if (this.currentChunkIndex >= this.streamingChunks.length) {
            // All chunks sent, finalize
            this.sendWebSocketMessage({flush: true});
            this.streamingMode = false;
            this.updateProgressBar(this.totalEstimatedDuration, this.totalEstimatedDuration);
            this.log('Streaming TTS completed - all chunks sent');
            return;
        }
        
        const chunk = this.streamingChunks[this.currentChunkIndex];
        
        // Add space before chunk (except for first chunk) to preserve word spacing
        const chunkToSend = this.currentChunkIndex === 0 ? chunk : ` ${chunk}`;
        
        this.log(`Streaming chunk ${this.currentChunkIndex + 1}/${this.streamingChunks.length}: "${chunkToSend}"`);
        
        // Send chunk immediately for TTS
        this.sendWebSocketMessage({text: chunkToSend});
        this.sentTextLength += chunkToSend.length;
        
        // Update progress estimation
        const estimatedCurrent = this.estimateAudioDuration(this.streamingChunks.slice(0, this.currentChunkIndex + 1).join(' '));
        this.updateProgressBar(estimatedCurrent, this.totalEstimatedDuration);
        
        this.currentChunkIndex++;
        
        // Schedule next chunk with minimal delay for fastest streaming
        setTimeout(() => {
            if (this.streamingMode) {
                this.streamNextChunk();
            }
        }, 50); // Reduced to 50ms for maximum speed
    }
    
    stopAllAndClear() {
        this.log('Stop all and clear requested');
        
        // Stop streaming mode
        this.streamingMode = false;
        this.streamingChunks = [];
        this.currentChunkIndex = 0;
        this.totalEstimatedDuration = 0;
        
        // Stop audio playback
        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource = null;
        }
        this.isPlaying = false;
        this.audioQueue = [];
        
        // Clear audio timing
        this.audioStartTime = null;
        
        // Clear text and captions
        this.textInput.value = '';
        this.sentTextLength = 0;
        this.stats.charCount = 0;
        this.fullText = '';
        this.processedTextLength = 0;
        this.firstChunkSentTime = null;
        this.firstAudioReceived = false;
        this.isNewSession = true;
        
        // Reset highlighting system
        this.resetHighlighting();
        
        // Reset caption display
        this.captionDisplay.innerHTML = '<p class="placeholder">Captions will appear here as you type...</p>';
        
        // Reset progress bar
        this.updateProgressBar(0, 0);
        
        // Clear server session
        this.sendWebSocketMessage({reset: true});
        
        // Reset mode if needed
        if (this.isLiveMode) {
            this.isLiveMode = false;
            this.enableLiveButton.textContent = 'Enable Live Typing';
            this.enableLiveButton.className = 'btn btn-primary';
        }
        
        // Clear any loading states
        document.querySelectorAll('.example-btn.loading').forEach(btn => {
            btn.classList.remove('loading');
        });
        
        // Update UI
        this.updateAudioQueueCount();
        
        this.log('Everything stopped and cleared');
    }
    

    
    handleAudioMessage(message) {
        try {
            // Record latency (first chunk sent to first audio received)
            if ((this.firstChunkSentTime || this.exampleClickTime) && !this.firstAudioReceived) {
                const currentTime = performance.now();
                const latency = this.exampleClickTime ? 
                    currentTime - this.exampleClickTime : 
                    currentTime - this.firstChunkSentTime;
                this.stats.latencies.push(latency);
                // Safely update latency display
                if (this.latencyDisplay) {
                    this.latencyDisplay.textContent = `${Math.round(latency)}ms`;
                }
                this.firstAudioReceived = true;
                this.log(`First audio latency: ${Math.round(latency)}ms`);
                
                // Clear example click time after measuring latency
                this.exampleClickTime = null;
            }
            
            this.stats.chunkCount++;
            this.log(`Received audio chunk: ${message.audio ? message.audio.length : 0} bytes, ${message.alignment ? message.alignment.chars.length : 0} chars`);
            
            // Queue audio for playback with error handling
            if (message.audio) {
                this.queueAudioForPlayback(message.audio).catch(error => {
                    this.log(`Audio queueing failed: ${error.message}`);
                });
            }
            
            // Update captions with error handling
            try {
                const captionText = message.full_text || message.processed_text || (message.alignment ? message.alignment.chars.join('') : '');
                if (captionText) {
                    this.updateCaptions(captionText);
                }
            } catch (captionError) {
                this.log(`Caption update failed: ${captionError.message}`);
            }
            
            // Update streaming progress if in streaming mode with error handling
            try {
                if (this.streamingMode && this.totalEstimatedDuration > 0) {
                    const processedText = message.full_text || '';
                    const estimatedCurrent = this.estimateAudioDuration(processedText);
                    this.updateProgressBar(Math.min(estimatedCurrent, this.totalEstimatedDuration), this.totalEstimatedDuration);
                }
            } catch (progressError) {
                this.log(`Progress update failed: ${progressError.message}`);
            }
            
            // Update UI safely
            try {
                this.updateAudioQueueCount();
            } catch (uiError) {
                this.log(`UI update failed: ${uiError.message}`);
            }
            
        } catch (error) {
            this.log(`❌ Critical error in handleAudioMessage: ${error.message}`);
            this.log(`Error stack: ${error.stack}`);
            // Don't disconnect - continue processing
        }
    }
    
    async queueAudioForPlayback(audioBase64, data) {
        try {
            // Check if audio context is available
            if (!this.audioContext) {
                this.log('Audio context not available - skipping audio playback');
                return;
            }
            
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                    this.log(`Audio context resumed: ${this.audioContext.state}`);
                } catch (resumeError) {
                    this.log(`Failed to resume audio context: ${resumeError.message}`);
                    return;
                }
            }
            
            // Decode base64 to binary
            const binaryString = atob(audioBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Convert to audio buffer (44.1 kHz, 16-bit PCM, mono)
            const audioBuffer = await this.pcmToAudioBuffer(bytes, 44100, 1);
            
            // Add to queue with associated data
            this.audioQueue.push({ audioBuffer, data });
            this.updateAudioQueueCount();
            
            // Start playing immediately if not already playing (reduces initial latency)
            if (!this.isPlaying && this.audioQueue.length === 1) {
                // Small delay to allow for audio context to be ready
                setTimeout(() => {
                    this.playNextAudio();
                }, 50);
            }
            
        } catch (error) {
            this.log(`Audio queueing failed: ${error.message}`);
            // Don't let audio errors disconnect WebSocket
        }
    }
    
    async pcmToAudioBuffer(pcmData, sampleRate, channels) {
        if (!this.audioContext) {
            throw new Error('Audio context not available');
        }
        
        // Convert 16-bit PCM data to Float32Array
        // Expected format: 44.1 kHz, 16-bit, mono PCM encoded as Base64
        const samples = pcmData.length / 2; // 16-bit = 2 bytes per sample
        const audioBuffer = this.audioContext.createBuffer(channels, samples, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        
        // Convert 16-bit signed integers to float (-1 to 1)
        for (let i = 0; i < samples; i++) {
            const sample = (pcmData[i * 2] | (pcmData[i * 2 + 1] << 8));
            // Convert from 16-bit signed to float (-1 to 1)
            channelData[i] = sample < 32768 ? sample / 32768 : (sample - 65536) / 32768;
        }
        
        return audioBuffer;
    }
    
    playNextAudio() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            this.audioStartTime = null;
            this.audioPlaybackStartTime = null;
            return;
        }
        
        if (!this.audioContext) {
            this.log('Audio context not available - cannot play audio');
            this.isPlaying = false;
            return;
        }
        
        this.isPlaying = true;
        const queueItem = this.audioQueue.shift();
        const audioBuffer = queueItem.audioBuffer || queueItem; // Handle both new and old queue format
        const data = queueItem.data || null;
        
        try {
            // Create audio source
            this.currentSource = this.audioContext.createBufferSource();
            this.currentSource.buffer = audioBuffer;
            this.currentSource.connect(this.gainNode);
            
            // Set up completion handler - play next immediately to reduce gaps
            this.currentSource.onended = () => {
                // Small delay to prevent audio glitches, but keep it minimal
                setTimeout(() => {
                    this.playNextAudio();
                }, 10); // 10ms delay instead of processing next immediately
            };
            
            // Record when this audio chunk starts playing (improved timing)
            this.audioStartTime = this.audioContext.currentTime * 1000;
            
            // Start highlighting when first audio chunk begins (with better sync)
            if (!this.isHighlightingActive && this.wordElements.length > 0) {
                // Small delay to account for audio processing latency
                setTimeout(() => {
                    this.startHighlighting();
                }, 50); // 50ms delay to better sync with actual audio output
            }
            
            this.log(`Playing audio chunk: ${audioBuffer.duration * 1000}ms duration`);
            
            // Start playback immediately
            this.currentSource.start(0);
            this.updateAudioQueueCount();
        } catch (audioError) {
            this.log(`Audio playback failed: ${audioError.message}`);
            this.isPlaying = false;
            // Try to continue with next audio in queue
            setTimeout(() => {
                this.playNextAudio();
            }, 100);
        }
    }
    
    updateCaptions(text) {
        // Clear placeholder only once at the start
        if (this.captionDisplay.querySelector('.placeholder')) {
            this.captionDisplay.innerHTML = '';
            this.log('Cleared placeholder for first caption chunk');
        }
        
        this.log(`Updating captions with text: "${text}"`);
        
        // Simple text display without highlighting
        this.captionDisplay.innerHTML = '';
        const textSpan = document.createElement('span');
        textSpan.className = 'caption-text';
        textSpan.textContent = text;
        this.captionDisplay.appendChild(textSpan);
        
        // Update processed text length
        this.processedTextLength = text.length;
    }
    
    // All highlighting-related methods removed for simplicity
    
    // Highlighting-related methods removed for simplicity
    
    // All highlighting-related methods removed for simplicity
    

    
    // Legacy character-based update method removed
    
    onVolumeChange(event) {
        this.volume = event.target.value / 100;
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
        this.volumeValue.textContent = `${event.target.value}%`;
    }
    
    onChunkSizeChange(event) {
        const newSize = parseInt(event.target.value, 10);
        if (newSize >= 5 && newSize <= 50) {
            this.log(`Chunk size changed to ${newSize} words`);
        } else {
            this.log('Chunk size must be between 5 and 50 words');
            event.target.value = Math.min(50, Math.max(5, newSize));
        }
    }
    
    updateConnectionStatus(status) {
        this.connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        this.connectionStatus.className = `status ${status}`;
    }
    
    updateAudioQueueCount() {
        try {
            if (this.audioQueueCount) {
                this.audioQueueCount.textContent = this.audioQueue.length;
            }
        } catch (error) {
            this.log(`Failed to update audio queue count: ${error.message}`);
        }
    }
    
    startStatsUpdater() {
        setInterval(() => {
            // Update statistics
            this.charCountEl.textContent = this.stats.charCount;
            this.chunkCountEl.textContent = this.stats.chunkCount;
            
            // Calculate average latency
            if (this.stats.latencies.length > 0) {
                const avgLatency = this.stats.latencies.reduce((a, b) => a + b, 0) / this.stats.latencies.length;
                this.avgLatencyEl.textContent = `${Math.round(avgLatency)}ms`;
            }
            
            // Update session duration
            const duration = Date.now() - this.stats.sessionStart;
            const minutes = Math.floor(duration / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            this.sessionDurationEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('p');
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        if (this.debugLog) {
            this.debugLog.appendChild(logEntry);
            
            // Keep only last 50 log entries
            while (this.debugLog.children.length > 50) {
                this.debugLog.removeChild(this.debugLog.firstChild);
            }
            
            // Scroll to bottom
            this.debugLog.scrollTop = this.debugLog.scrollHeight;
        }
        
        console.log(`[TTS Client] ${message}`);
    }
    
    cleanup() {
        this.log('Cleanup called - closing connections gracefully');
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Close WebSocket gracefully without sending close signal
            // The close signal {text: ''} should only be sent when explicitly requested
            this.ws.close(1000, 'Page unload');
        }
        
        if (this.currentSource) {
            this.currentSource.stop();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }
}

// Highlighting system completely removed for simplicity


class MathNotationProcessor {
    // Mathematical notation processing preserved for TTS conversion
    static SYMBOL_MAP = {
        // Basic operators
        '×': 'times',
        '÷': 'divided by',
        '=': 'equals',
        '≠': 'not equal to',
        '≈': 'approximately equals',
        '<': 'less than',
        '>': 'greater than',
        '≤': 'less than or equal to',
        '≥': 'greater than or equal to',
        '±': 'plus or minus',
        
        // Powers and roots
        '²': 'squared',
        '³': 'cubed',
        '⁴': 'to the fourth power',
        '⁵': 'to the fifth power',
        '⁶': 'to the sixth power',
        '⁷': 'to the seventh power',
        '⁸': 'to the eighth power',
        '⁹': 'to the ninth power',
        '√': 'square root of',
        '∛': 'cube root of',
        '∜': 'fourth root of',
        
        // Greek letters (common in math)
        'α': 'alpha',
        'β': 'beta',
        'γ': 'gamma',
        'δ': 'delta',
        'ε': 'epsilon',
        'θ': 'theta',
        'λ': 'lambda',
        'μ': 'mu',
        'π': 'pi',
        'σ': 'sigma',
        'φ': 'phi',
        'ω': 'omega',
        
        // Special constants and symbols
        '∞': 'infinity',
        'ℯ': 'e',
        '∂': 'partial derivative',
        '∇': 'nabla',
        '∆': 'delta',
        '∑': 'sum',
        '∏': 'product',
        '∫': 'integral',
        '∬': 'double integral',
        '∭': 'triple integral',
        
        // Set theory
        '∈': 'is in',
        '∉': 'is not in',
        '⊂': 'is a subset of',
        '⊃': 'is a superset of',
        '∪': 'union',
        '∩': 'intersection',
        '∅': 'empty set',
        
        // Logic
        '∀': 'for all',
        '∃': 'there exists',
        '¬': 'not',
        '∧': 'and',
        '∨': 'or',
        '→': 'implies',
        '↔': 'if and only if',
        
        // Angles and geometry
        '°': 'degrees',
        '∠': 'angle',
        '⊥': 'perpendicular to',
        '∥': 'parallel to',
        '≅': 'congruent to',
        '∼': 'similar to',
        
        // Miscellaneous
        '∝': 'proportional to',
        '∴': 'therefore',
        '∵': 'because',
        '%': 'percent',
        '‰': 'permille'
    };
    
    static processMathNotation(text) {
        let processed = text;
        
        // Handle fractions (basic pattern: number/number)
        processed = processed.replace(/(\d+)\/(\d+)/g, '$1 over $2');
        
        // Handle superscripts (basic pattern: x^n)
        processed = processed.replace(/(\w+)\^(\w+)/g, '$1 to the power of $2');
        
        // Handle subscripts (basic pattern: x_n)
        processed = processed.replace(/(\w+)_(\w+)/g, '$1 subscript $2');
        
        // Handle scientific notation
        processed = processed.replace(/([0-9.]+)[eE]([+-]?[0-9]+)/g, '$1 times 10 to the power of $2');
        
        // Replace mathematical symbols
        for (const [symbol, pronunciation] of Object.entries(this.SYMBOL_MAP)) {
            processed = processed.replace(new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ' + pronunciation + ' ');
        }
        
        // Handle parentheses and brackets
        processed = processed.replace(/\(/g, ' open parenthesis ');
        processed = processed.replace(/\)/g, ' close parenthesis ');
        processed = processed.replace(/\[/g, ' open bracket ');
        processed = processed.replace(/\]/g, ' close bracket ');
        processed = processed.replace(/\{/g, ' open brace ');
        processed = processed.replace(/\}/g, ' close brace ');
        
        // Clean up extra spaces
        processed = processed.replace(/\s+/g, ' ').trim();
        
        return processed;
    }
    
    static processLatexExpressions(text) {
        let processed = text;
        
        // Handle \frac{a}{b} -> "a over b"
        processed = processed.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2');
        
        // Handle \sqrt{x} -> "square root of x"
        processed = processed.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');
        
        // Handle \sqrt[n]{x} -> "nth root of x"
        processed = processed.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$1th root of $2');
        
        // Handle basic LaTeX commands
        processed = processed.replace(/\\sum/g, 'sum');
        processed = processed.replace(/\\int/g, 'integral');
        processed = processed.replace(/\\lim/g, 'limit');
        processed = processed.replace(/\\prod/g, 'product');
        
        // Remove remaining LaTeX commands
        processed = processed.replace(/\\[a-zA-Z]+/g, '');
        
        // Clean up
        processed = processed.replace(/\s+/g, ' ').trim();
        
        return processed;
    }
    
    static enhanceTextInput(inputElement) {
        // Math notation processing preserved, but preview functionality removed
        // Mathematical notation will still be processed by TTS for proper pronunciation
        this.log('Math notation processing available for TTS conversion');
    }
    
    static showMathPreview(original, processed) {
        // Math preview functionality removed
    }
    
    static hideMathPreview() {
        // Math preview functionality removed
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('📦 DOM Content Loaded - starting TTS client');
    try {
        window.ttsClient = new TTSWebSocketClient();
        console.log('✅ TTS client created successfully');
    } catch (error) {
        console.error('❌ Failed to create TTS client:', error);
        console.error('Error stack:', error.stack);
        
        // Try to show error in debug log if it exists
        const debugLog = document.getElementById('debugLog');
        if (debugLog) {
            debugLog.innerHTML = `<p style="color: red;">JavaScript Error: ${error.message}</p>`;
        }
    }
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('🛑 Global JavaScript error:', event.error);
    console.error('Error details:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
    
    const debugLog = document.getElementById('debugLog');
    if (debugLog) {
        debugLog.innerHTML += `<p style="color: red;">Global Error: ${event.message} at ${event.filename}:${event.lineno}</p>`;
    }
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('🛑 Unhandled promise rejection:', event.reason);
    
    const debugLog = document.getElementById('debugLog');
    if (debugLog) {
        debugLog.innerHTML += `<p style="color: red;">Promise Rejection: ${event.reason}</p>`;
    }
});