#!/bin/bash
# ChunkCodeMagic - Termux Setup and Launch Helper

echo "=================================================="
echo "✨ Welcome to the ChunkCodeMagic Termux Assistant! ✨"
echo "=================================================="
echo ""

# Check if GEMINI_API_KEY is already set
if [ -z "$GEMINI_API_KEY" ]; then
    echo "🔑 GEMINI_API_KEY is currently not defined."
    echo "You need a Gemini API Key to interact with the model."
    echo "Get one at: https://aistudio.google.com/"
    echo ""
    read -p "Please paste your Gemini API Key here: " api_key
    
    if [ ! -z "$api_key" ]; then
        export GEMINI_API_KEY="$api_key"
        echo "✅ API Key temporarily loaded into current shell session."
        echo ""
        
        # Persistent storage offer
        read -p "Do you want to save this key persistently so it loads automatically? (y/N): " save_persistent
        if [[ "$save_persistent" =~ ^[Yy]$ ]]; then
            echo "export GEMINI_API_KEY=\"$api_key\"" >> ~/.bashrc
            echo "✅ API Key successfully added to ~/.bashrc!"
        fi
    else
        echo "⚠️ No key entered. Proceeding without setting GEMINI_API_KEY."
    fi
else
    echo "✅ GEMINI_API_KEY is already loaded in your environment!"
fi

echo ""
# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 node_modules not found. Installing dependencies..."
    npm install
fi

echo ""
# Ask to start the server
read -p "Do you want to launch the development server now? (Y/n): " run_server
if [[ ! "$run_server" =~ ^[Nn]$ ]]; then
    echo "🚀 Starting development server..."
    npm run dev || npm start || node server.js
fi
