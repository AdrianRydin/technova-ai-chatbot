import React from "react";

export function ChatMessage({ role, content }) {
  return (
    <div
      className={`flex ${
        role === "user" ? "justify-end" : "justify-start"
      } mb-4`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          role === "user"
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-100 border border-gray-700"
        }`}
      >
        <p className="whitespace-pre-wrap wrap-break-words">{content}</p>
      </div>
    </div>
  );
}
