import { useRef, useState, useEffect } from "react";
import { ScrollArea } from "./components/ScrollArea";
import { ChatMessage } from "./components/ChatMessage";
import { Input } from "./components/Input";
import { Button } from "./components/Button";
import { Send } from "lucide-react";
import { ask } from "./lib/api";

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant",
      content: "Hej! Jag är din AI assistent, vad kan jag hjälpa dig med idag?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollAreaRef = useRef(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current?.querySelector(
        '[data-slot="scroll-area-viewport"]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    try {
      const res = await ask([...messages, userMessage]);

      const botMessage = {
        id: `${Date.now()}-bot`,
        role: "assistant",
        content: res?.text || "Jag kunde inte generare ett svar just nu.",
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          role: "assistant",
          content: "Ett fel inträffade vid anslutning till servern",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl h-[90vh] bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-800">
        <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
          <h1 className="text-gray-100">TechNova Kundservice</h1>
          <p className="text-gray-400 text-sm mt-1">
            Fråga min vad som helst om vår policy!
          </p>
        </div>
        <ScrollArea className="flex-1 px-6 py-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))}
            {isTyping && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-800 text-gray border border-gray-700 rounded-2xl px-4 py-3">
                  <div className="flex space-x-2">
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="bg-gray-900 border-t border-gray-800 px-6 py-4">
          <div className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Skriv din fråga..."
              className="flex-1 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:ring-blue-600 focus:border-blue-600"
              disabled={isTyping}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
