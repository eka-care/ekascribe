#!/bin/bash

# Example usage scripts for vaded_flow.py automation
# Make sure to have your audio files in ~/Downloads/vaded/ before running

echo "Voice2Rx VADED Flow - Example Usage"
echo "===================================="
echo ""

if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Please run 'python -m venv venv' first."
    exit 1
fi

source venv/bin/activate

if [ ! -f "$HOME/Downloads/vaded/1.mp3" ] || [ ! -f "$HOME/Downloads/vaded/2.mp3" ]; then
    echo "Warning: Audio files not found in ~/Downloads/vaded/"
    echo "   Please place 1.mp3 and 2.mp3 in ~/Downloads/vaded/ directory"
    echo ""
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Example 1: Run on dev environment with default result mode
echo ""
echo "Example 1: Dev environment with default result mode"
echo "----------------------------------------------------"
echo "Command: python scripts/automation/vaded_flow.py --env dev"
echo ""
read -p "Press Enter to run this example (or Ctrl+C to skip)..."
python scripts/automation/vaded_flow.py --env dev

# Example 2: Run on dev with template mode
echo ""
echo ""
echo "Example 2: Dev environment with template result mode"
echo "-----------------------------------------------------"
echo "Command: python scripts/automation/vaded_flow.py --env dev --result-mode template --template-id f2c26479-f9b8-4462-a909-82c6829e1416"
echo ""
read -p "Press Enter to run this example (or Ctrl+C to skip)..."
python scripts/automation/vaded_flow.py --env dev \
    --result-mode template \
    --template-id f2c26479-f9b8-4462-a909-82c6829e1416

# Example 3: Run on dev with transcript mode
echo ""
echo ""
echo "Example 3: Dev environment with transcript result mode"
echo "-------------------------------------------------------"
echo "Command: python scripts/automation/vaded_flow.py --env dev --result-mode transcript"
echo ""
read -p "Press Enter to run this example (or Ctrl+C to skip)..."
python scripts/automation/vaded_flow.py --env dev --result-mode transcript

# Example 4: Run on stage environment
echo ""
echo ""
echo "Example 4: Stage environment with default result mode"
echo "------------------------------------------------------"
echo "Command: python scripts/automation/vaded_flow.py --env stage"
echo ""
read -p "Press Enter to run this example (or Ctrl+C to skip)..."
python scripts/automation/vaded_flow.py --env stage

echo ""
echo ""
echo "All examples completed!"

