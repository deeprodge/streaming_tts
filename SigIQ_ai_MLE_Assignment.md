
# SigIQ.ai MLE FT Assignment

## Implement an ElevenLabs TTS Service Clone

### Introduction
This assignment challenges you to design and build a low-latency service for real-time inference using open-weight models. Specifically, you will implement a bidirectional streaming WebSocket for a Text-to-Speech (TTS) system, similar to the ElevenLabs WebSocket API.

In this assignment, you will be required to:
- (a) research the open-source TTS space
- (b) design and implement a WebSocket inference server
- (c) test and improve the quality of your system’s outputs

Crucially, your TTS engine must only use open-weight models. **You may not call cloud-based TTS services** such as ElevenLabs or Azure TTS.  
Your solution will be primarily evaluated on **output quality** and **latency**.  

You are free to use the internet and/or AI for assistance. If you need GPU acceleration, we recommend that you use a Tesla T4 instance on Google Colab.  
Ensure that all of your code is neatly contained within a single Colab notebook.

---

## Functional Requirements

### 1. WebSocket Implementation
Your system must expose a bidirectional WebSocket endpoint with concurrent send and receive.  
You do not necessarily need a one-to-one mapping of input to output chunks, but you should minimize the latency between the first input chunk received and the first output chunk sent by your server.

**Input:**  
A client will stream JSON chunks to your server via the WebSocket. The chunks you receive will contain these two fields:
- **text:** A string for which audio will be generated. In the first chunk from the client, this field will contain only a single space character. In the final chunk, it will be an empty string, indicating that the WebSocket should be closed.
- **flush:** A boolean that forces audio generation for input text received so far, if it has not been generated already. When flush is true, the WebSocket must remain open regardless of the text value.

**Output:**  
Your system will stream audio chunks back to the client via the same WebSocket. Format the audio chunks as **44.1 kHz, 16-bit, mono PCM**, encoded as Base64.  
Enclose each audio chunk in a JSON with two fields:
- **audio:** A string containing the Base64 encoding of an audio chunk.
- **alignment:** A dictionary containing character alignment data.

---

### 2. Character Alignments
Along with each audio chunk, output estimated timestamps for each character spoken in that chunk, including punctuation and whitespace.

**Example Output:**
```json
{
  "chars": ["T","h","i","s"," ","i","s"," ","a","n"," ","e",
            "x","a","m","p","l","e"," ","o","f"," ","a","l","i","g","n","m",
            "e","n","t"," ","d","a","t","a","."," "],
  "char_start_times_ms": [0,70,139,186,221,279,325,360,406,441,476,534,580,662,
                          755,824,894,952,1010,1057,1103,1138,1196,1242,1324,1382,
                          1416,1463,1498,1544,1579,1614,1660,1695,1788,1858,1974,2077],
  "char_durations_ms": [70,69,46,35,58,45,34,46,34,34,58,45,82,92,68,70,57,58,
                        46,46,34,58,46,82,57,34,47,34,46,34,35,45,35,92,70,115,255,103]
}
```

---

### 3. Deployment
Expose a publicly reachable WebSocket endpoint over the network.

---

### 4. Testing UI
Develop a minimal client to test your service. This client should:
- Stream chunked text to your TTS WebSocket as specified above
- Play audio chunks as they are received
- Use the alignment data to display real-time captions

---

### 5. (Bonus) Handle Math Input
Extend your TTS system to produce accurate spoken output for mathematical notation, including symbols, units, expressions, and equations.

**Example Inputs:**
- The product of three and seven is \(3 	imes 7 = 21\).
- For a right triangle, the Pythagorean theorem states \(a^2 + b^2 = c^2\).
- The derivative of \(e^x\) with respect to \(x\) is \(rac{d}{dx} e^x = e^x\).

---

## Evaluation Criteria
During a review call, you will share your final solution with us in the form of a Colab notebook.  
We will test your implementation and discuss your code as well as the design choices you made.  
We expect you to thoroughly analyze any tradeoffs you made between quality and performance.

1. **Output Audio Quality**  
   Your TTS output should be clear, intelligible, and free from excessive artifacts.

2. **Latency**  
   Minimize the latency between the first text chunk input to the WebSocket and the first audio chunk output from the WebSocket by your system.  
   An acceptable solution measures ≤600 ms p50 for this metric, ignoring network latency.

3. **Character Alignment Accuracy**  
   Character timestamp estimates should be as close to the ground truth as possible.

---

## Resources
- We do not expect you to have any domain specific expertise on TTS systems. Feel free to use the internet and/or AI to guide you.
- We strongly recommend that you use a Tesla T4 instance on Google Colab.
- You may not use cloud TTS services such as ElevenLabs or Azure TTS.

[PDF Link](https://drive.google.com/file/d/1x7okE3MzClbsFbeV8hfVOa4wDVwz3QNy/view?usp=sharing)
