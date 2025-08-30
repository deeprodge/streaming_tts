"""
TTS Engine Module
Handles kokoro TTS integration and character-level alignment generation
"""

import asyncio
import base64
import logging
import re
from typing import Dict, List, Tuple, Optional, Any
from collections import defaultdict
import json

import numpy as np
import torch
import torchaudio
from scipy import signal
from fastapi import WebSocket
import soundfile as sf

# Kokoro TTS imports
from kokoro import KPipeline

logger = logging.getLogger(__name__)


class MathNotationProcessor:
    """Handles mathematical notation conversion to spoken text"""
    
    # Mathematical symbols mapping
    SYMBOL_MAP = {
        # Basic operators
        '+': ' plus ',
        '-': ' minus ',
        '×': ' times ',
        '∗': ' times ',
        '*': ' times ',
        '÷': ' divided by ',
        '/': ' divided by ',
        '=': ' equals ',
        '≠': ' not equal to ',
        '≈': ' approximately equals ',
        '≡': ' identical to ',
        
        # Comparison operators
        '<': ' less than ',
        '>': ' greater than ',
        '≤': ' less than or equal to ',
        '≥': ' greater than or equal to ',
        '<<': ' much less than ',
        '>>': ' much greater than ',
        
        # Powers and roots
        '²': ' squared',
        '³': ' cubed',
        '⁴': ' to the fourth power',
        '⁵': ' to the fifth power',
        '⁶': ' to the sixth power',
        '⁷': ' to the seventh power',
        '⁸': ' to the eighth power',
        '⁹': ' to the ninth power',
        '√': ' square root of ',
        '∛': ' cube root of ',
        '∜': ' fourth root of ',
        
        # Greek letters
        'α': ' alpha ',
        'β': ' beta ',
        'γ': ' gamma ',
        'δ': ' delta ',
        'ε': ' epsilon ',
        'ζ': ' zeta ',
        'η': ' eta ',
        'θ': ' theta ',
        'ι': ' iota ',
        'κ': ' kappa ',
        'λ': ' lambda ',
        'μ': ' mu ',
        'ν': ' nu ',
        'ξ': ' xi ',
        'ο': ' omicron ',
        'π': ' pi ',
        'ρ': ' rho ',
        'σ': ' sigma ',
        'τ': ' tau ',
        'υ': ' upsilon ',
        'φ': ' phi ',
        'χ': ' chi ',
        'ψ': ' psi ',
        'ω': ' omega ',
        
        # Capital Greek letters
        'Α': ' capital alpha ',
        'Β': ' capital beta ',
        'Γ': ' capital gamma ',
        'Δ': ' capital delta ',
        'Ε': ' capital epsilon ',
        'Ζ': ' capital zeta ',
        'Η': ' capital eta ',
        'Θ': ' capital theta ',
        'Ι': ' capital iota ',
        'Κ': ' capital kappa ',
        'Λ': ' capital lambda ',
        'Μ': ' capital mu ',
        'Ν': ' capital nu ',
        'Ξ': ' capital xi ',
        'Ο': ' capital omicron ',
        'Π': ' capital pi ',
        'Ρ': ' capital rho ',
        'Σ': ' capital sigma ',
        'Τ': ' capital tau ',
        'Υ': ' capital upsilon ',
        'Φ': ' capital phi ',
        'Χ': ' capital chi ',
        'Ψ': ' capital psi ',
        'Ω': ' capital omega ',
        
        # Special constants
        '∞': ' infinity ',
        'ℯ': ' e ',
        'ℎ': ' h ',
        'ℏ': ' h bar ',
        'ℵ': ' aleph ',
        
        # Set theory and logic
        '∈': ' is in ',
        '∉': ' is not in ',
        '⊂': ' is a subset of ',
        '⊃': ' is a superset of ',
        '⊆': ' is a subset of or equal to ',
        '⊇': ' is a superset of or equal to ',
        '∪': ' union ',
        '∩': ' intersection ',
        '∅': ' empty set ',
        '∀': ' for all ',
        '∃': ' there exists ',
        '∄': ' there does not exist ',
        '¬': ' not ',
        '∧': ' and ',
        '∨': ' or ',
        '⊕': ' exclusive or ',
        '→': ' implies ',
        '↔': ' if and only if ',
        
        # Calculus and analysis
        '∫': ' integral ',
        '∬': ' double integral ',
        '∭': ' triple integral ',
        '∮': ' contour integral ',
        '∂': ' partial derivative ',
        '∇': ' nabla ',
        '∆': ' delta ',
        '∑': ' sum ',
        '∏': ' product ',
        '∐': ' coproduct ',
        'lim': ' limit ',
        
        # Arrows
        '←': ' left arrow ',
        '→': ' right arrow ',
        '↑': ' up arrow ',
        '↓': ' down arrow ',
        '↔': ' left right arrow ',
        '↕': ' up down arrow ',
        '⇐': ' left double arrow ',
        '⇒': ' right double arrow ',
        '⇑': ' up double arrow ',
        '⇓': ' down double arrow ',
        '⇔': ' left right double arrow ',
        
        # Miscellaneous
        '°': ' degrees ',
        '′': ' prime ',
        '″': ' double prime ',
        '‴': ' triple prime ',
        '∝': ' proportional to ',
        '∟': ' right angle ',
        '∠': ' angle ',
        '∥': ' parallel to ',
        '⊥': ' perpendicular to ',
        '±': ' plus or minus ',
        '∓': ' minus or plus ',
        '∴': ' therefore ',
        '∵': ' because ',
        '∷': ' as ',
        '∶': ' ratio ',
        '%': ' percent ',
        '‰': ' permille ',
    }
    
    @classmethod
    def process_mathematical_text(cls, text: str) -> str:
        """
        Convert mathematical notation to spoken text
        
        Args:
            text: Input text with mathematical symbols
            
        Returns:
            Text with mathematical symbols converted to spoken form
        """
        processed_text = text
        
        # Handle fractions (basic pattern: number/number)
        processed_text = re.sub(r'(\d+)/(\d+)', r'\1 over \2', processed_text)
        
        # Handle superscripts with ^ notation (x^2, x^n, etc.)
        processed_text = re.sub(r'([a-zA-Z0-9]+)\^([a-zA-Z0-9]+)', r'\1 to the power of \2', processed_text)
        
        # Handle subscripts with _ notation (x_1, H_2O, etc.)
        processed_text = re.sub(r'([a-zA-Z0-9]+)_([a-zA-Z0-9]+)', r'\1 subscript \2', processed_text)
        
        # Handle parentheses for grouping
        processed_text = processed_text.replace('(', ' open parenthesis ')
        processed_text = processed_text.replace(')', ' close parenthesis ')
        processed_text = processed_text.replace('[', ' open bracket ')
        processed_text = processed_text.replace(']', ' close bracket ')
        processed_text = processed_text.replace('{', ' open brace ')
        processed_text = processed_text.replace('}', ' close brace ')
        
        # Handle scientific notation (1.23e+5, 4.56E-3)
        processed_text = re.sub(r'([0-9.]+)[eE]([+-]?[0-9]+)', r'\1 times 10 to the power of \2', processed_text)
        
        # SMART HYPHEN HANDLING: Only convert hyphens to "minus" in mathematical contexts
        # Convert mathematical minus (standalone or between numbers/variables)
        processed_text = re.sub(r'\b(\d+)\s*-\s*(\d+)\b', r'\1 minus \2', processed_text)  # "5 - 3"
        processed_text = re.sub(r'\b([a-zA-Z])\s*-\s*([a-zA-Z0-9])\b', r'\1 minus \2', processed_text)  # "x - y"
        processed_text = re.sub(r'\s-\s', ' minus ', processed_text)  # " - " with spaces
        
        # Replace other mathematical symbols (excluding hyphen from SYMBOL_MAP)
        symbol_map_no_hyphen = {k: v for k, v in cls.SYMBOL_MAP.items() if k != '-'}
        for symbol, spoken in symbol_map_no_hyphen.items():
            processed_text = processed_text.replace(symbol, spoken)
        
        # Clean up extra spaces
        processed_text = re.sub(r'\s+', ' ', processed_text.strip())
        
        return processed_text
    
    @classmethod
    def process_latex_expressions(cls, text: str) -> str:
        """
        Handle basic LaTeX expressions
        
        Args:
            text: Text that may contain LaTeX expressions
            
        Returns:
            Text with LaTeX converted to spoken form
        """
        processed_text = text
        
        # Handle \frac{a}{b} -> "a over b"
        processed_text = re.sub(r'\\frac\{([^}]+)\}\{([^}]+)\}', r'\1 over \2', processed_text)
        
        # Handle \sqrt{x} -> "square root of x"
        processed_text = re.sub(r'\\sqrt\{([^}]+)\}', r'square root of \1', processed_text)
        
        # Handle \sqrt[n]{x} -> "nth root of x"
        processed_text = re.sub(r'\\sqrt\[([^]]+)\]\{([^}]+)\}', r'\1th root of \2', processed_text)
        
        # Handle x^{y} -> "x to the power of y"
        processed_text = re.sub(r'([a-zA-Z0-9]+)\^\{([^}]+)\}', r'\1 to the power of \2', processed_text)
        
        # Handle x_{y} -> "x subscript y"
        processed_text = re.sub(r'([a-zA-Z0-9]+)_\{([^}]+)\}', r'\1 subscript \2', processed_text)
        
        # Handle \sum_{i=1}^{n} -> "sum from i equals 1 to n"
        processed_text = re.sub(r'\\sum_\{([^}]+)\}\^\{([^}]+)\}', r'sum from \1 to \2', processed_text)
        
        # Handle \int_{a}^{b} -> "integral from a to b"
        processed_text = re.sub(r'\\int_\{([^}]+)\}\^\{([^}]+)\}', r'integral from \1 to \2', processed_text)
        
        # Handle \lim_{x \to a} -> "limit as x approaches a"
        processed_text = re.sub(r'\\lim_\{([^}]+)\\to\s*([^}]+)\}', r'limit as \1 approaches \2', processed_text)
        
        # Remove remaining LaTeX commands
        processed_text = re.sub(r'\\[a-zA-Z]+', '', processed_text)
        
        # Clean up
        processed_text = re.sub(r'\s+', ' ', processed_text.strip())
        
        return processed_text


class ConnectionManager:
    """Manages WebSocket connections and session state"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_data: Dict[str, Dict[str, Any]] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """Register a new WebSocket connection"""
        self.active_connections[session_id] = websocket
        self.session_data[session_id] = {
            "text_buffer": "",
            "full_text": "",
            "is_active": True,
            "created_at": asyncio.get_event_loop().time()
        }
        logger.info(f"Session {session_id} connected")
    
    async def disconnect(self, session_id: str):
        """Remove a WebSocket connection"""
        if session_id in self.active_connections:
            del self.active_connections[session_id]
        if session_id in self.session_data:
            del self.session_data[session_id]
        logger.info(f"Session {session_id} disconnected")
    
    async def initialize_session(self, session_id: str):
        """Initialize session for new stream"""
        if session_id in self.session_data:
            self.session_data[session_id]["text_buffer"] = ""
            self.session_data[session_id]["full_text"] = ""  # Also clear full_text for new sessions
            self.session_data[session_id]["is_active"] = True
            logger.debug(f"Session {session_id} initialized - buffers cleared")
    
    async def add_text_chunk(self, session_id: str, text: str):
        """Add text chunk to session buffer"""
        if session_id in self.session_data:
            self.session_data[session_id]["text_buffer"] += text
            # Also maintain full text for captions
            if "full_text" not in self.session_data[session_id]:
                self.session_data[session_id]["full_text"] = ""
            self.session_data[session_id]["full_text"] += text
    
    def get_text_buffer(self, session_id: str) -> str:
        """Get current text buffer for session"""
        if session_id in self.session_data:
            return self.session_data[session_id]["text_buffer"]
        return ""
    
    def clear_text_buffer(self, session_id: str):
        """Clear text buffer for session"""
        if session_id in self.session_data:
            self.session_data[session_id]["text_buffer"] = ""
    
    async def cleanup_all_connections(self):
        """Clean up all active connections"""
        for session_id in list(self.active_connections.keys()):
            await self.disconnect(session_id)


class TTSEngine:
    """Main TTS engine using kokoro library"""
    
    def __init__(self):
        self.pipeline = None
        self.kokoro_sample_rate = 24000  # Kokoro native sample rate
        self.target_sample_rate = 44100  # Output format: 44.1 kHz, 16-bit, mono PCM
        self.sample_rate = self.target_sample_rate  # For external compatibility
        self.ready = False
        self.lang_code = 'a'  # American English
        self.voice = 'af_heart'  # Default voice
    
    async def initialize(self):
        """Initialize kokoro TTS pipeline"""
        try:
            logger.info("Loading kokoro TTS pipeline...")
            
            # Initialize kokoro pipeline
            self.pipeline = KPipeline(lang_code=self.lang_code)
            
            self.ready = True
            logger.info(f"Kokoro TTS pipeline initialized successfully (lang: {self.lang_code}, voice: {self.voice})")
            
        except Exception as e:
            logger.error(f"Failed to initialize kokoro TTS pipeline: {e}")
            # Fall back to mock for development
            await self._mock_initialize()
            raise
    
    async def _mock_initialize(self):
        """Mock initialization for development/fallback"""
        # Simulate model loading time
        await asyncio.sleep(1)
        self.pipeline = "mock_kokoro_pipeline"
        self.ready = True
        logger.info("Mock TTS engine initialized (fallback mode)")
    
    def is_ready(self) -> bool:
        """Check if engine is ready"""
        return self.ready
    
    async def generate_audio_with_alignment(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Generate audio and character alignment for given text
        
        Returns:
            Dict with 'audio' (base64), 'alignment' (timing data), and 'word_alignment'
        """
        try:
            if not self.ready:
                raise RuntimeError("TTS Engine not initialized")
            
            # Store original text before processing
            original_text = text
            
            # Clean and validate input text (store original for logging)
            original_text_for_log = text
            processed_text = self._clean_text(text, original_text_for_log)
            if not processed_text.strip():
                return None
            
            logger.info(f"Generating audio for: '{processed_text[:50]}...'")
            start_time = asyncio.get_event_loop().time()
            
            # Step 1: Generate audio with phoneme timings (optimized)
            audio_data, phoneme_timings = await self._generate_audio_with_phoneme_timings(processed_text)
            
            # Step 2: Generate word-level alignment based on processed text
            word_alignments = self._generate_word_alignment(processed_text, phoneme_timings)
            
            # Step 3: Generate character-level alignment (for compatibility)
            char_alignments = self._generate_character_alignment(processed_text, phoneme_timings)
            
            # Step 4: Convert audio to base64
            audio_base64 = self._audio_to_base64(audio_data)
            
            generation_time = (asyncio.get_event_loop().time() - start_time) * 1000
            logger.info(f"Audio generation completed in {generation_time:.1f}ms")
            
            # Step 5: Format output with both original and processed text
            result = {
                "audio": audio_base64,
                "original_text": original_text,
                "processed_text": processed_text,
                "alignment": {
                    "chars": list(processed_text),
                    "char_start_times_ms": [int(align["start_ms"]) for align in char_alignments],
                    "char_durations_ms": [int(align["duration_ms"]) for align in char_alignments]
                },
                "word_alignment": {
                    "words": [w["word"] for w in word_alignments],
                    "word_start_times_ms": [int(w["start_ms"]) for w in word_alignments],
                    "word_durations_ms": [int(w["duration_ms"]) for w in word_alignments]
                },
                "full_text": processed_text  # Use processed text for captions
            }
            
            logger.debug(f"Generated audio chunk: {len(audio_base64)} bytes, {len(char_alignments)} characters, {len(word_alignments)} words")
            return result
            
        except Exception as e:
            logger.error(f"Audio generation failed: {e}")
            return None
    
    def _clean_text(self, text: str, original_text: str = None) -> str:
        """Clean and normalize input text, including mathematical notation"""
        original_for_debug = original_text or text
        
        # Process mathematical notation first
        text = MathNotationProcessor.process_mathematical_text(text)
        text = MathNotationProcessor.process_latex_expressions(text)
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text.strip())
        
        logger.debug(f"Text processing: original='{original_for_debug}' -> processed='{text}'")
        return text
    
    async def _generate_g2p_mapping(self, text: str) -> Dict[str, List[str]]:
        """
        Generate grapheme-to-phoneme mapping for each character
        Uses kokoro's internal G2P processing when available
        
        Returns:
            Dict mapping each character to its phoneme(s)
        """
        g2p_map = {}
        
        try:
            if isinstance(self.pipeline, str):  # Mock mode
                return self._generate_mock_g2p_mapping(text)
            
            # Use kokoro to get phoneme information
            # Generate once to extract phoneme mappings
            generator = self.pipeline(text, voice=self.voice, speed=1.0)
            
            char_index = 0
            for graphemes, phonemes, _ in generator:
                # Map each character in graphemes to corresponding phonemes
                chars_in_chunk = list(graphemes)
                
                if phonemes:
                    # Distribute phonemes across characters
                    phonemes_per_char = len(phonemes) / len(chars_in_chunk) if chars_in_chunk else 1
                    
                    for i, char in enumerate(chars_in_chunk):
                        phoneme_start_idx = int(i * phonemes_per_char)
                        phoneme_end_idx = int((i + 1) * phonemes_per_char)
                        char_phonemes = phonemes[phoneme_start_idx:phoneme_end_idx]
                        
                        if char_index < len(text):
                            g2p_map[text[char_index]] = char_phonemes if char_phonemes else []
                            char_index += 1
                else:
                    # No phonemes for this chunk (silence/punctuation)
                    for char in chars_in_chunk:
                        if char_index < len(text):
                            g2p_map[text[char_index]] = []
                            char_index += 1
            
            # Fill in any remaining characters
            while char_index < len(text):
                g2p_map[text[char_index]] = []
                char_index += 1
                
        except Exception as e:
            logger.warning(f"G2P extraction failed: {e}, using mock mapping")
            return self._generate_mock_g2p_mapping(text)
        
        logger.debug(f"G2P mapping generated for {len(text)} characters")
        return g2p_map
    
    def _generate_mock_g2p_mapping(self, text: str) -> Dict[str, List[str]]:
        """Generate mock G2P mapping for fallback"""
        g2p_map = {}
        for char in text:
            if char.isalpha():
                # Mock phoneme mapping
                g2p_map[char] = [f"/{char.lower()}/"]
            elif char.isspace():
                g2p_map[char] = []  # Silent
            else:
                g2p_map[char] = []  # Punctuation - silent
        return g2p_map
    
    async def _generate_audio_with_phoneme_timings(self, text: str) -> Tuple[np.ndarray, List[Tuple[str, float, float]]]:
        """
        Generate audio and extract phoneme timings using kokoro (optimized)
        
        Returns:
            Tuple of (audio_data, phoneme_timings)
            phoneme_timings: List of (phoneme, start_ms, end_ms)
        """
        try:
            if isinstance(self.pipeline, str):  # Mock mode
                return await self._generate_mock_audio_with_timings(text)
            
            # Use kokoro pipeline to generate audio - single pass for efficiency
            generator = self.pipeline(text, voice=self.voice, speed=1.0)
            
            audio_chunks = []
            phoneme_timings = []
            current_time_ms = 0
            
            # Process each chunk from kokoro generator in one pass
            for i, (graphemes, phonemes, audio) in enumerate(generator):
                logger.debug(f"Chunk {i}: '{graphemes}' -> {len(phonemes)} phonemes, {len(audio)} samples")
                
                # Accumulate audio
                audio_chunks.append(audio)
                
                # Calculate timing for phonemes in this chunk (using Kokoro's native sample rate)
                chunk_duration_ms = (len(audio) / self.kokoro_sample_rate) * 1000
                
                if phonemes:
                    phoneme_duration_ms = chunk_duration_ms / len(phonemes)
                    
                    # Add phoneme timings
                    for j, phoneme in enumerate(phonemes):
                        start_ms = current_time_ms + (j * phoneme_duration_ms)
                        end_ms = start_ms + phoneme_duration_ms
                        phoneme_timings.append((phoneme, start_ms, end_ms))
                else:
                    # Silent chunk (punctuation, etc.)
                    phoneme_timings.append(("", current_time_ms, current_time_ms + chunk_duration_ms))
                
                current_time_ms += chunk_duration_ms
            
            # Concatenate all audio chunks
            if audio_chunks:
                full_audio = np.concatenate(audio_chunks)
            else:
                full_audio = np.array([], dtype=np.float32)
            
            logger.debug(f"Generated {len(full_audio)} audio samples and {len(phoneme_timings)} phoneme timings")
            return full_audio, phoneme_timings
            
        except Exception as e:
            logger.error(f"Kokoro audio generation failed: {e}, falling back to mock")
            return await self._generate_mock_audio_with_timings(text)
    
    async def _generate_mock_audio_with_timings(self, text: str) -> Tuple[np.ndarray, List[Tuple[str, float, float]]]:
        """
        Generate mock audio and timings for development/fallback (44.1kHz output)
        """
        # Generate mock audio (sine wave) - reduced duration per character for faster speech
        duration_seconds = len(text) * 0.08  # 80ms per character (faster than before)
        samples = int(self.target_sample_rate * duration_seconds)
        t = np.linspace(0, duration_seconds, samples)
        frequency = 220  # A3 note
        audio_data = (np.sin(2 * np.pi * frequency * t) * 0.5).astype(np.float32)
        
        # Apply fade-in/fade-out to reduce clicks between chunks
        fade_samples = min(int(0.02 * self.target_sample_rate), samples // 20)  # 20ms fade at 44.1kHz
        if samples > fade_samples * 2:
            # Fade in
            audio_data[:fade_samples] *= np.linspace(0, 1, fade_samples)
            # Fade out
            audio_data[-fade_samples:] *= np.linspace(1, 0, fade_samples)
        
        # Generate mock phoneme timings
        phoneme_timings = []
        ms_per_char = (duration_seconds * 1000) / len(text)
        
        for i, char in enumerate(text):
            if char.isalpha():
                start_ms = i * ms_per_char
                end_ms = (i + 1) * ms_per_char
                phoneme_timings.append((f"/{char.lower()}/", start_ms, end_ms))
        
        logger.debug(f"Generated mock audio: {len(audio_data)} samples at {self.target_sample_rate}Hz")
        return audio_data, phoneme_timings
    
    def _generate_word_alignment(self, text: str, phoneme_timings: List[Tuple[str, float, float]]) -> List[Dict[str, Any]]:
        """
        Generate word-level alignment from phoneme timings
        
        Returns:
            List of word alignment data
        """
        import re
        
        # Split text into words (keep punctuation attached)
        words = re.findall(r'\S+', text)
        word_alignments = []
        
        if not phoneme_timings or not words:
            return word_alignments
        
        # Calculate total audio duration
        total_duration = phoneme_timings[-1][2] if phoneme_timings else 0
        
        # Distribute time across words based on character count
        total_chars = sum(len(word) for word in words)
        current_time = 0
        
        for word in words:
            word_char_count = len(word)
            # Proportional duration based on character count
            word_duration = (word_char_count / total_chars) * total_duration if total_chars > 0 else 0
            
            word_alignments.append({
                "word": word,
                "start_ms": current_time,
                "duration_ms": word_duration
            })
            
            current_time += word_duration
        
        logger.debug(f"Generated word alignment for {len(words)} words")
        return word_alignments
    
    def _generate_character_alignment(self, text: str, phoneme_timings: List[Tuple[str, float, float]]) -> List[Dict[str, float]]:
        """
        Generate character-level alignment from phoneme timings (simplified)
        
        Returns:
            List of alignment data for each character
        """
        char_alignments = []
        
        if not phoneme_timings:
            # Fallback: even distribution
            char_duration = 100  # 100ms per character
            for i, char in enumerate(text):
                char_alignments.append({
                    "start_ms": i * char_duration,
                    "duration_ms": char_duration
                })
            return char_alignments
        
        # Calculate total duration
        total_duration = phoneme_timings[-1][2] if phoneme_timings else 0
        char_duration = total_duration / len(text) if len(text) > 0 else 0
        
        # Simple even distribution
        for i, char in enumerate(text):
            char_alignments.append({
                "start_ms": i * char_duration,
                "duration_ms": char_duration
            })
        
        logger.debug(f"Generated character alignment for {len(text)} characters")
        return char_alignments
    
    def _audio_to_base64(self, audio_data: np.ndarray) -> str:
        """Convert audio data to base64 encoded PCM (44.1 kHz, 16-bit, mono)"""
        # Resample from 24kHz (Kokoro native) to 44.1kHz (target format)
        if self.kokoro_sample_rate != self.target_sample_rate:
            # Use scipy's resample for high-quality resampling
            resampling_ratio = self.target_sample_rate / self.kokoro_sample_rate
            target_length = int(len(audio_data) * resampling_ratio)
            audio_data = signal.resample(audio_data, target_length)
            logger.debug(f"Resampled audio from {self.kokoro_sample_rate}Hz to {self.target_sample_rate}Hz")
        
        # Convert to 16-bit PCM
        audio_int16 = (audio_data * 32767).astype(np.int16)
        
        # Convert to bytes
        audio_bytes = audio_int16.tobytes()
        
        # Encode as base64
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        logger.debug(f"Generated {len(audio_bytes)} bytes of 44.1kHz 16-bit mono PCM audio")
        return audio_base64
    
    async def cleanup(self):
        """Clean up TTS engine resources"""
        self.ready = False
        self.pipeline = None
        logger.info("TTS Engine cleaned up")