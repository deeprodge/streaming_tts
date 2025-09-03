# Streaming TTS Project - Issues and Fixes

This document provides a comprehensive overview of all issues encountered during the development of the Streaming TTS project and their corresponding solutions.

## Table of Contents
1. [Audio Format Compliance Issues](#audio-format-compliance-issues)
2. [Live Typing Mode Highlighting Issues](#live-typing-mode-highlighting-issues)
3. [UI Layout and Organization Issues](#ui-layout-and-organization-issues)
4. [Performance and Latency Issues](#performance-and-latency-issues)
5. [Codebase Cleanup and Organization](#codebase-cleanup-and-organization)
6. [Known Issues](#known-issues)

## Audio Format Compliance Issues

### Problem
The project needed to output audio in the specific format: 44.1 kHz, 16-bit, mono PCM, encoded as Base64. The existing implementation was using Kokoro's native 24kHz sample rate.

### Root Cause
- Kokoro TTS engine generates audio at 24kHz native sample rate
- Frontend was expecting 24kHz but needed to handle 44.1kHz
- No resampling mechanism was in place

### Solution
1. **Backend Changes** (`tts_engine.py`):
   - Separated Kokoro's native sample rate (24000) from target output rate (44100)
   - Added audio resampling using `scipy.signal.resample()` for 24kHz to 44.1kHz conversion
   - Updated timing calculations to use Kokoro's native rate while resampling for output
   - Enhanced `_audio_to_base64()` method with resampling logic

2. **Frontend Changes** (`script.js`):
   - Updated `pcmToAudioBuffer()` to expect 44.1kHz sample rate
   - Modified audio buffer creation to use 44100 Hz

3. **Test Updates** (`test_tts.py`):
   - Updated WAV output format from 24kHz to 44.1kHz

### Benefits
- CD-quality audio output (44.1 kHz, 16-bit, mono PCM)
- Maintained backward compatibility
- Improved audio quality for professional applications

## Live Typing Mode Highlighting Issues

### Problem
In live typing mode, when typing sequential sentences, highlighting was restarting from the beginning with each new sentence instead of continuing from where it left off.

### Root Cause
- `startHighlighting()` always reset `currentHighlightIndex = 0`
- `stopHighlighting()` didn't preserve position in live mode
- No mode-aware state management for highlighting continuation

### Solution
1. **Smart Highlighting Continuation** (`script.js`):
   - Modified `startHighlighting()` to find the first unspoken word in live mode
   - Implemented mode-aware logic that preserves highlighting position in live typing mode
   - Added logic to continue from the first non-spoken word

2. **Live Mode Timing Adjustment**:
   - Updated `scheduleNextHighlight()` with relative timing calculations for live mode continuation
   - Implemented elapsed speech time tracking to maintain proper timing

3. **Mode-Aware State Preservation**:
   - Modified `stopHighlighting()` to preserve `currentHighlightIndex` in live mode
   - Added forced reset functionality when explicitly needed

4. **Mode Switching Handling**:
   - Enhanced `toggleLiveMode()` and `resetHighlighting()` for proper state management
   - Implemented clean reset when switching between modes

### Benefits
- Natural, continuous highlighting flow in live typing mode
- Visual continuity with preserved 'spoken' states
- Different behavior for live vs standard modes
- Proper state preservation across DOM updates

## UI Layout and Organization Issues

### Problem
The UI layout needed reorganization for better user experience and workflow.

### Issues
1. Live Typing Mode and Standard TTS Mode boxes were in suboptimal positions
2. Example buttons were not positioned optimally for user workflow
3. Overall UI organization needed improvement

### Solution
1. **Swapped Mode Positions** (`index.html`):
   - Moved Standard TTS Mode box above Live Typing Mode box in the input section
   - Reorganized control sections for better logical flow

2. **Moved Example Buttons**:
   - Relocated example buttons to the caption column
   - Positioned them below the live typing mode box for better workflow

3. **Improved Layout Structure**:
   - Enhanced overall organization of UI elements
   - Created more intuitive user flow from input to output

### Benefits
- Improved user workflow and experience
- Better logical grouping of related controls
- More intuitive interface organization

## Performance and Latency Issues

### Problem
Latency measurement for example buttons was inaccurate, measuring over 1200ms instead of the actual input-to-audio latency.

### Root Cause
- Latency was being measured from text sending to first audio receipt
- Should have been measured from example button click to first audio receipt

### Solution
1. **Fixed Latency Measurement** (`script.js`):
   - Added `exampleClickTime` variable to track button click timing
   - Modified `handleExampleClick()` to record click time
   - Updated `handleAudioMessage()` to use click time for latency calculation when available
   - Implemented proper cleanup of example click time after measurement

2. **Enhanced Timing Logic**:
   - Added conditional logic to differentiate between example clicks and regular input
   - Implemented accurate latency calculation from user interaction to audio output

### Benefits
- More accurate latency measurements for user interactions
- Better performance monitoring and optimization opportunities
- Improved user experience with realistic performance metrics

## Codebase Cleanup and Organization

### Problem
The project contained numerous unnecessary files, documentation, and lacked proper organization.

### Issues
1. Excessive test files and documentation cluttering the repository
2. Incomplete or improperly formatted requirements.txt
3. Missing or inadequate .gitignore configuration
4. Unnecessary temporary and cache files

### Solution
1. **File Cleanup**:
   - Removed redundant documentation files
   - Deleted unnecessary test files and test output directories
   - Cleaned up unused HTML test files

2. **Dependency Management**:
   - Created proper requirements.txt with all necessary dependencies
   - Added version specifications for better reproducibility
   - Ensured all core dependencies were properly listed

3. **Project Structure**:
   - Organized files into a clean, maintainable structure
   - Updated .gitignore with comprehensive ignore patterns
   - Ensured only core application files remained

4. **Documentation Updates**:
   - Restructured README.md for better readability and less repetition
   - Created FINAL_SUMMARY.md documenting all changes
   - Added clear known issues documentation

### Benefits
- Cleaner, more maintainable codebase
- Proper dependency management
- Better project organization
- Clearer documentation for users and contributors

## Known Issues

### Live Caption Highlighting
**Status**: Currently experiencing synchronization issues and may not work reliably in all scenarios.

**Description**: 
The word-level highlighting feature is currently experiencing synchronization issues and may not work reliably in all scenarios. Users may experience:
- Inconsistent highlighting timing
- Words not highlighting at the correct time
- Highlighting stopping or restarting unexpectedly
- Incomplete highlighting of text passages

**Impact**: 
This affects both Live Typing Mode and Standard TTS Mode, as well as example button interactions.

**Resolution Status**: 
Active work is ongoing to resolve these issues. The problem is being actively investigated and solutions are being developed.

## Summary

This project has undergone significant improvements across multiple areas:
1. **Audio Quality**: Achieved CD-quality 44.1 kHz output through proper resampling
2. **User Experience**: Fixed highlighting continuity and improved UI organization
3. **Performance**: Implemented accurate latency measurements
4. **Maintainability**: Cleaned up codebase and improved documentation

While significant progress has been made, the live caption highlighting feature remains a work in progress that requires additional attention to achieve full reliability.