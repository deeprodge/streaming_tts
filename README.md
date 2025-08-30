# Real-Time TTS WebSocket Service

A low-latency streaming Text-to-Speech service with real-time caption highlighting.

## Features

- **Real-time TTS**: Low-latency text-to-speech conversion using kokoro library
- **Live Captioning**: Word-level caption highlighting synchronized with audio
- **Multiple Modes**: Live Typing mode and Standard TTS mode
- **Mathematical Notation**: Support for mathematical expressions and symbols
- **Streaming Architecture**: Progressive audio generation for faster response

## Quick Start

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/deeprodge/streaming_tts
   cd streaming_tts
   ```

2. **Install Dependencies**:
   ```bash
   conda create -n streaming_tts python=3.10
   conda activate streaming_tts
   pip install -r requirements.txt
   ```

2. **Run the Server**:
   ```bash
   python main.py
   ```

3. **Open Browser**:
   Navigate to `http://localhost:8000`

## Project Structure

```
streaming_tts/
├── main.py              # FastAPI application with WebSocket endpoint
├── tts_engine.py        # TTS engine with kokoro library integration
├── requirements.txt     # Python dependencies
└── static/
    ├── index.html       # Main UI interface
    ├── script.js        # Frontend WebSocket client and audio handling
    └── style.css        # UI styling with flat design
```

## Usage

- **Live Typing Mode**: Type text and get TTS on sentence boundaries (., !, ?)
- **Standard TTS Mode**: Convert complete text input with streaming
- **Mathematical Support**: Type mathematical expressions using symbols or LaTeX
- **Examples**: Use built-in quick examples for testing

## Technology Stack

- **Backend**: Python 3.10, FastAPI, WebSockets
- **TTS Engine**: kokoro library with phoneme-level timing
- **Frontend**: Vanilla JavaScript, Web Audio API
- **Audio**: Real-time PCM streaming with word-level highlighting