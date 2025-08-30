"""
Real-Time TTS WebSocket Service
Main FastAPI application with WebSocket endpoint for streaming TTS
"""

import asyncio
import json
import logging
import uuid
from typing import Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn

from tts_engine import TTSEngine, ConnectionManager


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global variables
tts_engine = None
connection_manager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown events"""
    global tts_engine, connection_manager
    
    # Startup
    logger.info("Starting TTS WebSocket Service...")
    try:
        tts_engine = TTSEngine()
        await tts_engine.initialize()
        connection_manager = ConnectionManager()
        logger.info("TTS Engine and Connection Manager initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize TTS engine: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down TTS WebSocket Service...")
    if connection_manager:
        await connection_manager.cleanup_all_connections()
    if tts_engine:
        await tts_engine.cleanup()


# Create FastAPI app with lifespan
app = FastAPI(
    title="Real-Time TTS WebSocket Service",
    description="Low-latency streaming Text-to-Speech service with character alignment",
    version="1.0.0",
    lifespan=lifespan
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def get_index():
    """Serve the main UI page"""
    try:
        with open("static/index.html", "r") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>TTS WebSocket Service</h1><p>Frontend not found. Please ensure static/index.html exists.</p>",
            status_code=404
        )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for bidirectional TTS streaming
    
    Protocol:
    - Input: {"text": " "} - Initialize session
    - Input: {"text": "content"} - Add text chunk
    - Input: {"text": ""} - Close session
    - Input: {"flush": true} - Force processing
    - Output: {"audio": "base64", "alignment": {...}}
    """
    session_id = str(uuid.uuid4())
    logger.info(f"New WebSocket connection: {session_id}")
    
    try:
        # Accept the WebSocket connection
        await websocket.accept()
        
        # Register the connection
        await connection_manager.connect(websocket, session_id)
        
        # Main message processing loop
        while True:
            try:
                # Receive message from client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                logger.debug(f"Session {session_id} received: {message}")
                
                # Handle different message types
                if "text" in message:
                    text = message["text"]
                    
                    if text == " ":
                        # Initialize session
                        logger.info(f"Session {session_id} initialized")
                        await connection_manager.initialize_session(session_id)
                        
                    elif text == "":
                        # Close session - process remaining text and close
                        logger.info(f"Session {session_id} closing")
                        await process_remaining_text(session_id, websocket)
                        break
                        
                    else:
                        # Add text chunk to buffer
                        await connection_manager.add_text_chunk(session_id, text)
                        
                        # Check if we should process (natural break)
                        if should_process_text(session_id):
                            await process_text_buffer(session_id, websocket)
                
                elif message.get("flush"):
                    # Force processing of current buffer
                    logger.info(f"Session {session_id} flush requested")
                    await process_text_buffer(session_id, websocket)
                
                elif message.get("reset"):
                    # Reset session for new text input
                    logger.info(f"Session {session_id} reset requested")
                    await connection_manager.initialize_session(session_id)
                
                else:
                    logger.warning(f"Session {session_id} unknown message format: {message}")
                    
            except json.JSONDecodeError as e:
                logger.error(f"Session {session_id} JSON decode error: {e}")
                try:
                    await websocket.send_text(json.dumps({"error": "Invalid JSON format"}))
                except Exception as send_error:
                    logger.error(f"Failed to send JSON error message: {send_error}")
                    break  # Connection is likely closed, exit loop
                
            except WebSocketDisconnect:
                logger.info(f"Session {session_id} client disconnected")
                break  # Exit the loop when client disconnects
                
            except Exception as e:
                logger.error(f"Session {session_id} processing error: {e}")
                logger.error(f"Error type: {type(e).__name__}")
                logger.error(f"Error details: {str(e)}")
                # Don't try to send error message if connection is already closed
                if not isinstance(e, WebSocketDisconnect):
                    try:
                        await websocket.send_text(json.dumps({"error": "Processing error"}))
                    except Exception as send_error:
                        logger.error(f"Failed to send error message: {send_error}")
                
    except WebSocketDisconnect:
        logger.info(f"Session {session_id} disconnected")
        
    except Exception as e:
        logger.error(f"Session {session_id} unexpected error: {e}")
        
    finally:
        # Clean up connection
        await connection_manager.disconnect(session_id)
        logger.info(f"Session {session_id} cleanup completed")


def should_process_text(session_id: str) -> bool:
    """Check if text buffer should be processed based on natural breaks and buffer size"""
    try:
        text_buffer = connection_manager.get_text_buffer(session_id)
        
        # Check for true sentence endings (not abbreviations)
        has_sentence_end = has_true_sentence_ending(text_buffer)
        
        # Also process if buffer is getting long (avoid too much latency)
        buffer_too_long = len(text_buffer.strip()) > 100
        
        # Process if we have a complete sentence or buffer is getting long
        return has_sentence_end or buffer_too_long
        
    except Exception:
        return False


def has_true_sentence_ending(text: str) -> bool:
    """Check for true sentence endings, ignoring common abbreviations"""
    import re
    
    # Common abbreviations that should NOT trigger sentence processing
    abbreviations = [
        # Titles
        r'\bMr\.',
        r'\bMrs\.',
        r'\bMs\.',
        r'\bDr\.',
        r'\bProf\.',
        r'\bRev\.',
        r'\bSt\.',
        r'\bMt\.',
        
        # Name suffixes
        r'\bJr\.',
        r'\bSr\.',
        r'\bII\.',
        r'\bIII\.',
        
        # Academic/Professional
        r'\bPhD\.',
        r'\bMD\.',
        r'\bLLD\.',
        r'\bBA\.',
        r'\bBS\.',
        r'\bMA\.',
        r'\bMS\.',
        
        # Common abbreviations
        r'\betc\.',
        r'\bvs\.',
        r'\be\.g\.',
        r'\bi\.e\.',
        r'\bInc\.',
        r'\bCorp\.',
        r'\bLtd\.',
        r'\bCo\.',
        r'\bLLC\.',
        
        # Geographic
        r'\bU\.S\.',
        r'\bU\.K\.',
        r'\bN\.Y\.',
        r'\bL\.A\.',
        r'\bD\.C\.',
        
        # Time/Date
        r'\ba\.m\.',
        r'\bp\.m\.',
        r'\bA\.M\.',
        r'\bP\.M\.',
        
        # Units/Measurements
        r'\bin\.',
        r'\bft\.',
        r'\blb\.',
        r'\boz\.',
        r'\bgal\.',
        r'\bmin\.',
        r'\bsec\.',
        r'\bmax\.',
    ]
    
    # Create pattern for all abbreviations
    abbrev_pattern = '|'.join(abbreviations)
    
    # Remove abbreviations from text temporarily
    text_without_abbrevs = re.sub(abbrev_pattern, 'ABBREV', text, flags=re.IGNORECASE)
    
    # Now check for real sentence endings
    sentence_endings = ['.', '!', '?']
    
    # Check if any true sentence endings remain after removing abbreviations
    for ending in sentence_endings:
        if ending in text_without_abbrevs:
            return True
    
    return False


async def process_text_buffer(session_id: str, websocket: WebSocket):
    """Process the current text buffer and send audio + alignment"""
    try:
        text_buffer = connection_manager.get_text_buffer(session_id)
        if not text_buffer.strip():
            return
            
        logger.info(f"Session {session_id} processing: '{text_buffer[:50]}...'")
        
        # Generate audio and alignment
        result = await tts_engine.generate_audio_with_alignment(text_buffer)
        
        if result:
            # **KEY FIX**: Add full accumulated text to the result for proper caption display
            # This ensures frontend gets complete text for caption rebuilding
            session_data = connection_manager.session_data.get(session_id, {})
            full_accumulated_text = session_data.get('full_text', text_buffer)
            result['full_text'] = full_accumulated_text
            
            # Also include the current chunk's processed text for highlighting
            result['current_chunk_text'] = result.get('processed_text', text_buffer)
            
            # Send result to client
            await websocket.send_text(json.dumps(result))
            logger.debug(f"Session {session_id} sent audio chunk with full_text: '{full_accumulated_text[:50]}...'")
            
            # Clear the processed text from buffer
            connection_manager.clear_text_buffer(session_id)
        
    except Exception as e:
        logger.error(f"Session {session_id} TTS processing error: {e}")
        await websocket.send_text(json.dumps({"error": "TTS processing failed"}))


async def process_remaining_text(session_id: str, websocket: WebSocket):
    """Process any remaining text in buffer before closing"""
    try:
        text_buffer = connection_manager.get_text_buffer(session_id)
        if text_buffer.strip():
            await process_text_buffer(session_id, websocket)
    except Exception as e:
        logger.error(f"Session {session_id} final processing error: {e}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "tts_engine_ready": tts_engine is not None and tts_engine.is_ready(),
        "active_connections": len(connection_manager.active_connections) if connection_manager else 0
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True
    )