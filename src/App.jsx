import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, 
  MicOff, 
  MessageSquare, 
  Coffee, 
  ClipboardList, 
  BarChart3, 
  Send, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Archive
} from 'lucide-react';

// --- Configuration & Constants ---
const API_BASE = import.meta.env.VITE_API_BASE || '';
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

// Resample Float32 mono to 16kHz and return Int16 PCM as base64 (for ElevenLabs Scribe Realtime)
function resampleAndEncodePCM16(float32, sourceRate = 48000, targetRate = 16000) {
  const ratio = sourceRate / targetRate;
  const outLength = Math.floor(float32.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio;
    const j = Math.floor(srcIdx);
    const f = srcIdx - j;
    const sample = j + 1 < float32.length ? float32[j] * (1 - f) + float32[j + 1] * f : float32[j];
    const s = Math.max(-1, Math.min(1, sample));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const b = new Uint8Array(out.buffer);
  let binary = '';
  for (let i = 0; i < b.length; i++) binary += String.fromCharCode(b[i]);
  return btoa(binary);
}
const TAX_RATE = 0.08875;

const MENU = {
  coffee: {
    "Americano": { small: 3.00, large: 4.00 },
    "Latte": { small: 4.00, large: 5.00 },
    "Cold Brew": { small: 4.00, large: 5.00 },
    "Mocha": { small: 4.50, large: 5.50 },
    "Coffee Frappuccino": { small: 5.50, large: 6.00 }
  },
  tea: {
    "Black Tea": { small: 3.00, large: 3.75 },
    "Jasmine Tea": { small: 3.00, large: 3.75 },
    "Lemon Green Tea": { small: 3.50, large: 4.25 },
    "Matcha Latte": { small: 4.50, large: 5.25 }
  },
  pastry: {
    "Plain Croissant": { price: 3.50 },
    "Chocolate Croissant": { price: 4.00 },
    "Chocolate Chip Cookie": { price: 2.50 },
    "Banana Bread (Slice)": { price: 3.00 }
  },
  add_ons: {
    "Whole Milk": 0.00,
    "Skim Milk": 0.00,
    "Oat Milk": 0.50,
    "Almond Milk": 0.75,
    "Extra Espresso Shot": 1.50,
    "Extra Matcha Shot": 1.50,
    "1 Pump Caramel Syrup": 0.50,
    "1 Pump Hazelnut Syrup": 0.50,
    "No Sugar": 0.00,
    "Less Sugar": 0.00,
    "Extra Sugar": 0.00,
    "No Ice": 0.00,
    "Less Ice": 0.00,
    "Extra Ice": 0.00
  }
};

function calculateItemBasePrice(item) {
  const isPastry = MENU.pastry[item.base_item];
  if (isPastry) return isPastry.price;
  const category = MENU.coffee[item.base_item] ? 'coffee' : 'tea';
  const sizeKey = item.size?.toLowerCase?.().includes('small') ? 'small' : 'large';
  return MENU[category]?.[item.base_item]?.[sizeKey] || 0;
}

function getItemLineTotal(item) {
  const basePrice = calculateItemBasePrice(item);
  let modsPrice = 0;
  Object.entries(item.modifications || {}).forEach(([mod, qty]) => {
    modsPrice += (MENU.add_ons[mod] || 0) * qty;
  });
  return basePrice + modsPrice;
}

const SYSTEM_PROMPT = `You are a fast, efficient NYC Coffee AI Cashier. 
Rules:
1. MAX 3 espresso shots per drink.
2. Frappuccinos are ONLY ICED. Decline hot requests.
3. All drinks can have sweetness levels: No Sugar, Less Sugar, Extra Sugar.
4. Gather: Item (from menu), Size (Small 12oz or Large 16oz), and Temp (Hot/Iced). Do not proactively ask about other mods, let the customer specify others if they want them (e.g. sweetness or extra shots).
5. After confirming the details of an item (name + modifications), ask the customer if they would like anything else. Do not rush them to complete the order.
6. Pastries do not need a size or temperature.
7. Ask for the Customer's Name at the end.
8. Output JSON inside <order_json>...</order_json> tags.
9. Do not ask unecessary questions or talk too much. Focus on being succinct and to the point, but still friendly and polite.
10. If a customer asks for the order total, only give the total, you don't need to provide it by item.
11. If the customer asks for the price of specific items, give them the base item price as well as the prices of any modifications (e.g. extra shots).

Items: Americano, Latte, Cold Brew, Mocha, Coffee Frappuccino, Black Tea, Jasmine Tea, Lemon Green Tea, Matcha Latte, Plain Croissant, Chocolate Croissant, Chocolate Chip Cookie, Banana Bread (Slice).

JSON structure:
{
  "customerName": "string",
  "items": [{
    "base_item": "Exact Item Name",
    "size": "Small (12oz)" | "Large (16oz)" | "N/A",
    "temp": "Hot" | "Iced" | "N/A",
    "modifications": {"Mod Name": quantity}
  }]
}

====

Here is information on the menu and the pricing, in case the customer asks:

const TAX_RATE = 0.08875;

const MENU = {
  coffee: {
    "Americano": { small: 3.00, large: 4.00 },
    "Latte": { small: 4.00, large: 5.00 },
    "Cold Brew": { small: 4.00, large: 5.00 },
    "Mocha": { small: 4.50, large: 5.50 },
    "Coffee Frappuccino": { small: 5.50, large: 6.00 }
  },
  tea: {
    "Black Tea": { small: 3.00, large: 3.75 },
    "Jasmine Tea": { small: 3.00, large: 3.75 },
    "Lemon Green Tea": { small: 3.50, large: 4.25 },
    "Matcha Latte": { small: 4.50, large: 5.25 }
  },
  pastry: {
    "Plain Croissant": { price: 3.50 },
    "Chocolate Croissant": { price: 4.00 },
    "Chocolate Chip Cookie": { price: 2.50 },
    "Banana Bread (Slice)": { price: 3.00 }
  },
  add_ons: {
    "Whole Milk": 0.00,
    "Skim Milk": 0.00,
    "Oat Milk": 0.50,
    "Almond Milk": 0.75,
    "Extra Espresso Shot": 1.50,
    "Extra Matcha Shot": 1.50,
    "1 Pump Caramel Syrup": 0.50,
    "1 Pump Hazelnut Syrup": 0.50,
    "No Sugar": 0.00,
    "Less Sugar": 0.00,
    "Extra Sugar": 0.00,
    "No Ice": 0.00,
    "Less Ice": 0.00,
    "Extra Ice": 0.00
  }
};
`;

const Header = ({ activeView, setView }) => (
  <header className="bg-stone-900 text-white p-4 shadow-lg sticky top-0 z-50">
    <div className="max-w-6xl mx-auto flex justify-between items-center">
      <div className="flex items-center gap-2">
        <Coffee className="text-amber-400" />
        <h1 className="font-bold text-xl tracking-tight uppercase">NYC Coffee AI</h1>
      </div>
      <nav className="flex gap-2">
        {[
          { id: 'customer', label: 'Order', icon: Mic },
          { id: 'barista', label: 'Barista', icon: ClipboardList },
          { id: 'owner', label: 'Owner', icon: BarChart3 }
        ].map(nav => (
          <button
            key={nav.id}
            onClick={() => setView(nav.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-bold ${
              activeView === nav.id ? 'bg-amber-500 text-white' : 'hover:bg-stone-800 text-stone-400'
            }`}
          >
            <nav.icon size={16} />
            <span className="hidden sm:inline">{nav.label}</span>
          </button>
        ))}
      </nav>
    </div>
  </header>
);

const CustomerView = () => {
  const [messages, setMessages] = useState([{ role: 'assistant', text: "Welcome to NYC Coffee! What can I get for you?" }]);
  const [inputText, setInputText] = useState('');
  const [isVoice, setIsVoice] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState('browser');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const scribeWsRef = useRef(null);
  const scribeAudioContextRef = useRef(null);
  const scribeProcessorRef = useRef(null);
  const scribeChunkBufferRef = useRef([]);
  const SCRIBE_TARGET_SAMPLE_RATE = 16000;
  const SCRIBE_CHUNK_DURATION_MS = 120;
  const SCRIBE_SAMPLES_PER_CHUNK = Math.floor((SCRIBE_CHUNK_DURATION_MS / 1000) * SCRIBE_TARGET_SAMPLE_RATE);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const callGeminiWithRetry = async (payload, retries = 5, delay = 1000) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (err) {
      if (retries > 0) {
        await new Promise(res => setTimeout(res, delay));
        return callGeminiWithRetry(payload, retries - 1, delay * 2);
      }
      throw err;
    }
  };

  const handleSendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    const payload = {
      contents: [...messages, userMsg].map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
      })),
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
    };

    try {
      const data = await callGeminiWithRetry(payload);
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I missed that.";
      const jsonMatch = aiText.match(/<order_json>([\s\S]*?)<\/order_json>/);
      let cleanText = aiText.replace(/<order_json>[\s\S]*?<\/order_json>/, "").trim();

      setMessages(prev => [...prev, { role: 'assistant', text: cleanText }]);

      if (jsonMatch) {
        try {
          const orderData = JSON.parse(jsonMatch[1]);
          finalizeOrder(orderData);
        } catch (e) { console.error("JSON Error", e); }
      }
      if (isVoice) speak(cleanText);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: "Connection error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const finalizeOrder = async (orderData) => {
    const itemsForPayload = orderData.items.map(item => ({
      base_item: item.base_item,
      size: item.size,
      temp: item.temp,
      modifications: item.modifications || {}
    }));
    const subtotal = itemsForPayload.reduce((sum, item) => sum + getItemLineTotal(item), 0);
    const tax = subtotal * TAX_RATE;
    const grandTotal = subtotal + tax;

    const payload = {
      customerName: orderData.customerName,
      subtotal,
      tax,
      grand_total: grandTotal,
      status: 'not_started',
      created_at: new Date().toISOString(),
      items: itemsForPayload
    };

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save order');
      const { order_id } = await res.json();
      setReceipt({ ...payload, order_id });
    } catch (err) { console.error("Save Error", err); }
  };

  const speak = async (text) => {
    if (!text?.trim()) return;
    if (voiceProvider === 'elevenlabs' && ELEVENLABS_API_KEY) {
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg'
          },
          body: JSON.stringify({ text: text.trim(), model_id: 'eleven_multilingual_v2' })
        });
        if (!res.ok) throw new Error('TTS failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      } catch (err) {
        console.error('ElevenLabs TTS', err);
      }
      return;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = async () => {
    if (voiceProvider === 'elevenlabs') {
      try {
        const tokenRes = await fetch(`${API_BASE}/api/elevenlabs-scribe-token`);
        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({}));
          console.error('Scribe token failed', err);
          return;
        }
        const { token } = await tokenRes.json();
        if (!token) {
          console.error('No Scribe token in response');
          return;
        }
        const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${encodeURIComponent(token)}&model_id=scribe_v2_realtime&commit_strategy=vad&audio_format=pcm_16000`;
        const ws = new WebSocket(wsUrl);
        scribeWsRef.current = ws;
        scribeChunkBufferRef.current = [];

        ws.onopen = async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            scribeAudioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const bufferSize = 2048;
            const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
            scribeProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              const input = e.inputBuffer.getChannelData(0);
              const b64 = resampleAndEncodePCM16(input, ctx.sampleRate, SCRIBE_TARGET_SAMPLE_RATE);
              const newSamples = Math.floor(input.length * SCRIBE_TARGET_SAMPLE_RATE / ctx.sampleRate);
              const buf = scribeChunkBufferRef.current;
              buf.push({ b64, samples: newSamples });
              let total = buf.reduce((s, c) => s + c.samples, 0);
              while (total >= SCRIBE_SAMPLES_PER_CHUNK && buf.length > 0) {
                const first = buf.shift();
                total -= first.samples;
                try {
                  ws.send(JSON.stringify({
                    message_type: 'input_audio_chunk',
                    audio_base_64: first.b64,
                    sample_rate: SCRIBE_TARGET_SAMPLE_RATE
                  }));
                } catch (_) {}
              }
            };
            source.connect(processor);
            processor.connect(ctx.destination);
            setIsListening(true);
          } catch (err) {
            console.error('Microphone / Scribe pipeline', err);
            ws.close();
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.message_type === 'committed_transcript' && data.text?.trim()) {
              handleSendMessage(data.text.trim());
            }
          } catch (_) {}
        };

        ws.onerror = () => { setIsListening(false); };
        ws.onclose = () => {
          setIsListening(false);
          const stream = streamRef.current;
          if (stream) stream.getTracks().forEach((t) => t.stop());
          scribeAudioContextRef.current?.close();
          scribeProcessorRef.current = null;
          scribeWsRef.current = null;
        };
      } catch (err) {
        console.error('ElevenLabs Scribe connect', err);
      }
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.onstart = () => setIsListening(true);
    recognitionRef.current.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript;
      handleSendMessage(transcript);
    };
    recognitionRef.current.onend = () => setIsListening(false);
    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (voiceProvider === 'elevenlabs' && scribeWsRef.current) {
      scribeWsRef.current.close();
      scribeProcessorRef.current?.disconnect();
      scribeAudioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-80px)] p-4">
      {receipt ? (
        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-2xl border border-stone-100 flex flex-col animate-in fade-in zoom-in duration-300">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="text-3xl font-black text-stone-900">Receipt</h2>
            <p className="text-stone-500 font-medium">Order for {receipt.customerName}</p>
          </div>

          <div className="flex-1 space-y-6 mb-8 overflow-y-auto">
            {receipt.items.map((item, i) => (
              <div key={i} className="border-b border-stone-50 pb-4">
                <div className="flex justify-between items-start mb-1">
                  <div className="font-bold text-stone-900">
                    {item.base_item} 
                    {item.size !== "N/A" && <span className="text-stone-400 font-normal ml-1">({item.size})</span>}
                  </div>
                  <div className="font-mono text-stone-600">${calculateItemBasePrice(item).toFixed(2)}</div>
                </div>
                <div className="space-y-1">
                  {item.temp !== "N/A" && <div className="text-xs text-stone-400 uppercase tracking-wider">{item.temp}</div>}
                  {Object.entries(item.modifications || {}).map(([mod, qty]) => {
                    const cost = (MENU.add_ons[mod] || 0) * qty;
                    return (
                      <div key={mod} className="flex justify-between text-xs font-medium text-amber-700">
                        <span>+ {mod} {qty > 1 ? `x${qty}` : ''}</span>
                        {cost > 0 && <span>+${cost.toFixed(2)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t pt-6">
            <div className="flex justify-between text-stone-500 text-sm">
              <span>Subtotal</span>
              <span>${receipt.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-stone-500 text-sm">
              <span>Sales Tax (8.875%)</span>
              <span>${receipt.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-2xl font-black text-stone-900 pt-2 border-t mt-2">
              <span>Total</span>
              <span>${receipt.grand_total.toFixed(2)}</span>
            </div>
          </div>

          <button 
            onClick={() => setReceipt(null)}
            className="w-full mt-10 py-4 bg-stone-900 text-white rounded-2xl font-black hover:bg-stone-800 transition-all uppercase tracking-widest shadow-lg active:scale-95"
          >
            New Order
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-5 py-3 rounded-2xl ${m.role === 'user' ? 'bg-amber-500 text-white rounded-tr-none' : 'bg-white text-stone-800 shadow-sm border border-stone-100 rounded-tl-none'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-stone-400 text-xs animate-pulse italic ml-2">Brewing a response...</div>}
            <div ref={scrollRef} />
          </div>

          <div className="bg-white p-3 rounded-3xl shadow-xl border border-stone-100 flex flex-col gap-3">
            {isVoice && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Voice:</span>
                <div className="flex bg-stone-100 p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => !isListening && setVoiceProvider('browser')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${voiceProvider === 'browser' ? 'bg-white shadow text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                  >
                    Browser
                  </button>
                  <button
                    type="button"
                    onClick={() => !isListening && setVoiceProvider('elevenlabs')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${voiceProvider === 'elevenlabs' ? 'bg-white shadow text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                  >
                    ElevenLabs
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  if (isVoice && isListening) stopListening();
                  if (isVoice && voiceProvider === 'elevenlabs' && streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                  }
                  setIsVoice(!isVoice);
                }}
                className={`p-3.5 rounded-2xl transition-all ${isVoice ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-400'}`}
              >
                {isVoice ? <Mic size={22} /> : <MessageSquare size={22} />}
              </button>
              
              {isVoice ? (
                <button 
                  onClick={isListening ? stopListening : startListening}
                  className={`flex-1 flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-stone-900 text-white hover:bg-stone-800'}`}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                  {isListening ? "Listening..." : "Start Talking"}
                </button>
              ) : (
              <div className="flex-1 flex items-center bg-stone-50 rounded-2xl pr-2">
                <input 
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
                  placeholder="Ask for an Iced Latte..."
                  className="flex-1 px-4 py-3 bg-transparent focus:outline-none font-medium"
                />
                <button onClick={() => handleSendMessage(inputText)} className="p-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors">
                  <Send size={18} />
                </button>
              </div>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const BaristaView = () => {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active');

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/orders`);
      if (!res.ok) throw new Error('Failed to fetch');
      const all = await res.json();
      all.sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));
      setOrders(all);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 4000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (id, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchOrders();
    } catch (err) { console.error(err); }
  };

  const active = orders.filter(o => o.status !== 'completed');
  const history = orders.filter(o => o.status === 'completed');

  const historyByDay = useMemo(() => {
    const map = {};
    history.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(o);
    });
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, dayOrders]) => ({ key, orders: dayOrders }));
  }, [history]);

  const todayKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);
  const yesterdayKey = useMemo(() => {
    const n = new Date();
    n.setDate(n.getDate() - 1);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const dayLabel = (key) => {
    if (key === todayKey) return 'Today';
    if (key === yesterdayKey) return 'Yesterday';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
        <h2 className="text-3xl font-black text-stone-900">Queue</h2>
        <div className="flex bg-stone-200 p-1 rounded-2xl w-full md:w-auto">
          <button onClick={() => setTab('active')} className={`flex-1 px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${tab === 'active' ? 'bg-white shadow text-stone-900' : 'text-stone-500'}`}>
            <Clock size={18} /> Pending ({active.length})
          </button>
          <button onClick={() => setTab('history')} className={`flex-1 px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${tab === 'history' ? 'bg-white shadow text-stone-900' : 'text-stone-500'}`}>
            <Archive size={18} /> History ({history.length})
          </button>
        </div>
      </div>

      {tab === 'active' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {active.map(order => (
            <div key={order.id} className={`bg-white rounded-3xl p-6 shadow-sm border-l-[12px] transition-all ${order.status === 'in_progress' ? 'border-amber-400' : 'border-stone-200'}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight">{order.customerName || 'Guest'}</h3>
                  <p className="text-xs font-bold text-stone-400 mt-1">{order.created_at ? new Date(order.created_at).toLocaleTimeString() : ''}</p>
                </div>
                <span className={`text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest ${order.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-400'}`}>
                  {order.status.replace('_', ' ')}
                </span>
              </div>
              <div className="space-y-4 mb-8">
                {order.items.map((item, idx) => (
                  <div key={idx} className="bg-stone-50 p-3 rounded-2xl">
                    <p className="font-black text-stone-800 leading-tight">{item.base_item} {item.size !== "N/A" ? `(${item.size})` : ''}</p>
                    <div className="mt-2 space-y-0.5">
                      {item.temp !== "N/A" && <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{item.temp}</p>}
                      {Object.entries(item.modifications || {}).map(([k,v]) => (
                        <p key={k} className="text-xs font-bold text-amber-700">• {k} {v > 1 ? `x${v}` : ''}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                {order.status === 'not_started' ? (
                  <button onClick={() => updateStatus(order.id, 'in_progress')} className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-black uppercase tracking-wider text-xs">Start Prep</button>
                ) : (
                  <button onClick={() => updateStatus(order.id, 'completed')} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black uppercase tracking-wider text-xs">Complete Order</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {historyByDay.map(({ key, orders: dayOrders }) => (
            <section key={key}>
              <h3 className="text-sm font-black text-stone-400 uppercase tracking-widest mb-4">{dayLabel(key)}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dayOrders.map((order) => (
                  <div key={order.id} className="bg-white rounded-3xl p-6 shadow-sm border-l-[12px] border-stone-200">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight">{order.customerName || 'Guest'}</h3>
                        <p className="text-xs font-bold text-stone-400 mt-1">{order.created_at ? new Date(order.created_at).toLocaleTimeString() : ''}</p>
                      </div>
                      <span className="text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest bg-stone-100 text-stone-400">completed</span>
                    </div>
                    <div className="space-y-4">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="bg-stone-50 p-3 rounded-2xl">
                          <p className="font-black text-stone-800 leading-tight">{item.base_item} {item.size !== "N/A" ? `(${item.size})` : ''}</p>
                          <div className="mt-2 space-y-0.5">
                            {item.temp !== "N/A" && <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{item.temp}</p>}
                            {Object.entries(item.modifications || {}).map(([k,v]) => (
                              <p key={k} className="text-xs font-bold text-amber-700">• {k} {v > 1 ? `x${v}` : ''}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

const OwnerView = () => {
  const [orders, setOrders] = useState([]);
  const [timeframe, setTimeframe] = useState('today');

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/orders`);
      if (!res.ok) throw new Error('Failed to fetch');
      setOrders(await res.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(startOfToday); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const sevenDaysStart = new Date(startOfToday); sevenDaysStart.setDate(sevenDaysStart.getDate() - 7);

    const filtered = orders.filter(o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      if (timeframe === 'today') return d >= startOfToday;
      if (timeframe === 'yesterday') return d >= yesterdayStart && d < startOfToday;
      if (timeframe === '7d') return d >= sevenDaysStart && d < startOfToday;
      return true;
    });

    const totalRevenue = filtered.reduce((acc, curr) => acc + (curr.grand_total || 0), 0);
    const completed = filtered.filter(o => o.status === 'completed' && o.completed_at);
    let totalPrep = 0;
    completed.forEach(o => totalPrep += (new Date(o.completed_at) - new Date(o.created_at)) / 1000);

    const itemCounts = {};
    const modCounts = {};
    filtered.forEach(o => {
      o.items.forEach(i => {
        if (!itemCounts[i.base_item]) itemCounts[i.base_item] = { qty: 0, sales: 0 };
        itemCounts[i.base_item].qty += 1;
        itemCounts[i.base_item].sales += getItemLineTotal(i);
        Object.keys(i.modifications || {}).forEach(m => modCounts[m] = (modCounts[m] || 0) + 1);
      });
    });

    return {
      sales: totalRevenue.toFixed(2),
      count: filtered.length,
      avgOrder: filtered.length ? (totalRevenue / filtered.length).toFixed(2) : "0.00",
      avgPrep: completed.length ? (totalPrep / completed.length / 60).toFixed(1) : "0.0",
      topItems: Object.entries(itemCounts).sort((a,b) => b[1].qty - a[1].qty).slice(0, 3),
      topMods: Object.entries(modCounts).sort((a,b) => b[1] - a[1]).slice(0, 3)
    };
  }, [orders, timeframe]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12">
        <h2 className="text-4xl font-black text-stone-900 tracking-tight">Performance</h2>
        <div className="flex bg-stone-100 p-1.5 rounded-2xl shadow-inner border border-stone-200">
          {['today', 'yesterday', '7d'].map(t => (
            <button key={t} onClick={() => setTimeframe(t)} className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${timeframe === t ? 'bg-white shadow text-stone-900' : 'text-stone-400'}`}>{t.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Revenue (inc Tax)', value: `$${stats.sales}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Order Count', value: stats.count, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Avg Ticket', value: `$${stats.avgOrder}`, icon: Coffee, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Avg Prep Time', value: `${stats.avgPrep}m`, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' }
        ].map((c, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100 relative overflow-hidden">
            <div className={`absolute -right-4 -bottom-4 opacity-5 p-4 ${c.bg} rounded-full`}>
               <c.icon size={80} />
            </div>
            <div className="flex items-center gap-2 mb-3 text-stone-400 font-bold text-xs uppercase tracking-widest"><c.icon size={16} /> {c.label}</div>
            <p className="text-3xl font-black text-stone-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
          <h3 className="font-black mb-8 text-stone-400 uppercase text-xs tracking-widest border-b pb-4">Menu Leaderboard</h3>
          <div className="space-y-6">
            {stats.topItems.map(([name, d], i) => (
              <div key={name} className="flex justify-between items-center group">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black text-stone-200 group-hover:text-amber-400 transition-colors">0{i+1}</span>
                  <div>
                    <p className="font-black text-stone-800 leading-none">{name}</p>
                    <p className="text-[10px] font-bold text-stone-400 uppercase mt-1">{d.qty} total units</p>
                  </div>
                </div>
                <span className="font-mono font-bold text-stone-600">${d.sales.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
          <h3 className="font-black mb-8 text-stone-400 uppercase text-xs tracking-widest border-b pb-4">Modification Usage</h3>
          <div className="space-y-6">
            {stats.topMods.map(([name, count]) => (
              <div key={name}>
                <div className="flex justify-between text-xs font-bold mb-2 uppercase tracking-tight text-stone-600">
                  <span>{name}</span>
                  <span className="text-stone-900">{count} occurrences</span>
                </div>
                <div className="w-full bg-stone-50 h-3 rounded-full overflow-hidden border border-stone-100">
                  <div className="bg-amber-400 h-full rounded-full transition-all duration-1000" style={{ width: `${(count / (stats.count || 1) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState('customer');

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans antialiased selection:bg-amber-200">
      <Header activeView={view} setView={setView} />
      <main className="max-w-7xl mx-auto">
        {view === 'customer' && <CustomerView />}
        {view === 'barista' && <BaristaView />}
        {view === 'owner' && <OwnerView />}
      </main>
    </div>
  );
}