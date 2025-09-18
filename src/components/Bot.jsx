import React, { useState, useEffect, useRef } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const Bot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [welcomeText, setWelcomeText] = useState("");
  const [file, setFile] = useState(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [copied, setCopied] = useState(null);
  const [recording, setRecording] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup speech synthesis
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Typing welcome text
  useEffect(() => {
    const welcomeMsg =
      "👋 Hi! I'm your AI-powered chatbot. How can I help you today?";
    let index = 0;
    const interval = setInterval(() => {
      setWelcomeText((prev) => prev + welcomeMsg[index]);
      index++;
      if (index === welcomeMsg.length) {
        clearInterval(interval);
        setMessages([{ role: "bot", text: welcomeMsg }]);
      }
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // Convert file to Base64
  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    });

  // Text-to-Speech
  const speak = (text) => {
    if (!voiceMode) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  // Stop Speaking
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setRecording(false);
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() && !file) return;

    const userMessage = { role: "user", text: input || "📎 Sent a file", file };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      if (file) {
        const base64 = await toBase64(file);
        const result = await model.generateContent([
          input,
          {
            inlineData: {
              mimeType: file.type,
              data: base64.split(",")[1],
            },
          },
        ]);

        const botReply = result.response.text();
        setMessages((prev) => [...prev, { role: "bot", text: botReply }]);
        speak(botReply);
      } else {
        const result = await model.generateContentStream(input);

        let botMessage = { role: "bot", text: "" };
        let botIndex;

        setMessages((prev) => {
          botIndex = prev.length;
          return [...prev, botMessage];
        });

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            botMessage.text += chunkText;
            setMessages((prev) => {
              const updated = [...prev];
              updated[botIndex] = { ...botMessage };
              return updated;
            });
          }
        }

        speak(botMessage.text);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "⚠️ Oops! Something went wrong with Gemini API." },
      ]);
    } finally {
      setFile(null);
      setLoading(false);
      setVoiceMode(false);
    }
  };

  // Enter key
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Voice input
  const startListening = () => {
    const recognition = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    recognition.lang = "en-US";
    recognition.start();
    setRecording(true);

    recognition.onresult = (event) => {
      setInput(event.results[0][0].transcript);
      setVoiceMode(true);
    };

    recognition.onerror = (err) => {
      console.error("Speech recognition error:", err);
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
    };
  };

  // Copy code to clipboard
  const copyToClipboard = (code, idx) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="p-4 bg-gray-800 text-lg font-bold shadow">
        🤖 AI Chatbot
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {welcomeText && messages.length === 0 && (
          <motion.div
            className="p-3 rounded-lg max-w-lg bg-gray-700 mr-auto whitespace-pre-wrap"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {welcomeText}
            <span className="animate-pulse">|</span>
          </motion.div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            className={`p-3 rounded-lg max-w-2xl whitespace-pre-wrap overflow-x-auto ${
              msg.role === "user"
                ? "bg-blue-600 ml-auto text-right"
                : "bg-gray-700 mr-auto text-left"
            }`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <span className="font-bold">
              {msg.role === "user" ? "You: " : "Bot: "}
            </span>

            {/* Render Markdown with syntax highlighting and copy button */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeString = String(children).replace(/\n$/, "");

                  return !inline ? (
                    <div className="relative group">
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match?.[1] || "bash"}
                        PreTag="div"
                        className="rounded-lg my-2"
                        {...props}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                      <button
                        onClick={() => copyToClipboard(codeString, i)}
                        className="absolute top-2 right-2 text-xs bg-gray-800 px-2 py-1 rounded opacity-70 hover:opacity-100 transition"
                      >
                        {copied === i ? "✅ Copied!" : "📋 Copy"}
                      </button>
                    </div>
                  ) : (
                    <code className="bg-gray-800 px-1 py-0.5 rounded text-sm">
                      {children}
                    </code>
                  );
                },
              }}
            >
              {msg.text}
            </ReactMarkdown>

            {msg.file && (
              <div className="mt-2">
                {msg.file.type.startsWith("image/") ? (
                  <img
                    src={URL.createObjectURL(msg.file)}
                    alt="uploaded"
                    className="max-h-40 rounded-lg"
                  />
                ) : (
                  <a
                    href={URL.createObjectURL(msg.file)}
                    download={msg.file.name}
                    className="underline text-sm text-gray-300"
                  >
                    📎 {msg.file.name}
                  </a>
                )}
              </div>
            )}
          </motion.div>
        ))}

        <div ref={messagesEndRef} />
        {loading && (
          <div className="text-gray-400 italic">Gemini is thinking...</div>
        )}
      </main>

      {/* Input & Controls */}
      <footer className="p-4 bg-gray-800 flex flex-col gap-2">
        {file && (
          <div className="flex items-center gap-3 bg-gray-700 p-2 rounded-lg">
            {file.type.startsWith("image/") ? (
              <img
                src={URL.createObjectURL(file)}
                alt="preview"
                className="h-12 w-12 object-cover rounded-lg"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xl">📎</span>
                <span className="text-sm">{file.name}</span>
              </div>
            )}
            <button
              onClick={() => setFile(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ❌
            </button>
          </div>
        )}

        <div className="relative flex items-center w-full">
          <textarea
            className="flex-1 p-3 pr-32 rounded-2xl bg-gray-700 text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            rows="2"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            <input
              type="file"
              className="hidden"
              id="fileUpload"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <label
              htmlFor="fileUpload"
              className="flex items-center justify-center w-8 h-8 bg-gray-600 rounded-full hover:bg-gray-500 cursor-pointer"
              title="Attach a file"
            >
              📎
            </label>

            {/* Mic button with recording state */}
            <button
              onClick={startListening}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 
                ${
                  recording
                    ? "bg-red-600 animate-pulse"
                    : "bg-gray-600 hover:bg-gray-500"
                }`}
              title="Voice input"
            >
              🎤
            </button>

            <button
              onClick={stopSpeaking}
              className="flex items-center justify-center w-8 h-8 bg-gray-600 rounded-full hover:bg-gray-500 cursor-pointer"
              title="Stop voice"
            >
              ⏹
            </button>

            <button
              onClick={sendMessage}
              className="flex items-center justify-center w-8 h-8 bg-green-600 rounded-full hover:bg-green-700 cursor-pointer disabled:opacity-50"
              disabled={loading}
              title="Send message"
            >
              ➤
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Bot;
