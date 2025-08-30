#!/usr/bin/env python3
"""
Mike-AI-IDE Icon Generator
Creates branded icons for all platforms (Windows, macOS, Linux)
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont
import argparse


def create_mike_ai_icon(size, output_path, format='PNG'):
    """Create a Mike-AI-IDE icon with the specified size"""

    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Mike-AI-IDE color scheme
    primary_blue = (30, 144, 255)  # #1E90FF - DodgerBlue
    secondary_purple = (138, 43, 226)  # #8A2BE2 - BlueViolet
    accent_cyan = (0, 255, 255)  # #00FFFF - Cyan

    # Create gradient background circle
    center = size // 2
    radius = int(size * 0.45)

    # Draw outer circle with gradient effect
    for i in range(radius, 0, -1):
        alpha = int(255 * (i / radius))
        color = (*primary_blue, alpha)
        draw.ellipse([center - i, center - i, center +
                     i, center + i], fill=color)

    # Draw inner circle for depth
    inner_radius = int(radius * 0.8)
    draw.ellipse([center - inner_radius, center - inner_radius,
                  center + inner_radius, center + inner_radius],
                 fill=(*secondary_purple, 200))

    # Draw AI symbol - stylized brain/circuit pattern
    draw_ai_symbol(draw, center, inner_radius, accent_cyan)

    # Add "M" for Mike in the center
    try:
        font_size = max(int(size * 0.3), 12)
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", font_size)
        except:
            font = ImageFont.load_default()

    # Draw "M" in white
    text = "M"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = center - text_width // 2
    text_y = center - text_height // 2

    # Draw text with shadow for better visibility
    draw.text((text_x + 1, text_y + 1), text, fill=(0, 0, 0, 128), font=font)
    draw.text((text_x, text_y), text, fill=(255, 255, 255, 255), font=font)

    # Save based on format
    if format.upper() == 'ICO':
        img.save(output_path, format='ICO', sizes=[(size, size)])
    elif format.upper() == 'ICNS':
        # For ICNS, we need multiple sizes
        sizes = [16, 32, 64, 128, 256, 512, 1024]
        icons = []
        for s in sizes:
            if s <= size:
                icon = img.resize((s, s), Image.Resampling.LANCZOS)
                icons.append(icon)

        # Save first icon as ICNS (simplified approach)
        img.save(output_path, format='PNG')  # Fallback to PNG for now
        print(f"Note: Created PNG instead of ICNS for {output_path}")
    else:
        img.save(output_path, format=format)

    print(f"Created {format} icon: {output_path} ({size}x{size})")


def draw_ai_symbol(draw, center, radius, color):
    """Draw a stylized AI symbol (circuit/neural network pattern)"""

    # Draw connecting lines (neural network style)
    line_width = max(2, radius // 20)

    # Draw a simple circuit pattern
    points = [
        (center - radius//3, center - radius//3),
        (center + radius//3, center - radius//3),
        (center + radius//3, center + radius//3),
        (center - radius//3, center + radius//3),
    ]

    # Connect the points
    for i in range(len(points)):
        start = points[i]
        end = points[(i + 1) % len(points)]
        draw.line([start, end], fill=(*color, 180), width=line_width)

    # Draw nodes at intersection points
    node_radius = max(2, radius // 10)
    for point in points:
        draw.ellipse([point[0] - node_radius, point[1] - node_radius,
                      point[0] + node_radius, point[1] + node_radius],
                     fill=(*color, 255))

    # Draw center connection
    draw.ellipse([center - node_radius, center - node_radius,
                  center + node_radius, center + node_radius],
                 fill=(*color, 255))


def create_file_type_icon(base_icon_path, file_type, output_path, size=48):
    """Create a file type icon with the file extension overlay"""

    # Create base icon
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw file icon shape
    primary_blue = (30, 144, 255)

    # File shape
    file_width = int(size * 0.8)
    file_height = int(size * 0.9)
    corner_size = int(size * 0.15)

    x = (size - file_width) // 2
    y = (size - file_height) // 2

    # Draw file body
    draw.rectangle([x, y + corner_size, x + file_width, y + file_height],
                   fill=(*primary_blue, 220))

    # Draw file corner fold
    draw.polygon([x + file_width - corner_size, y,
                  x + file_width, y + corner_size,
                  x + file_width - corner_size, y + corner_size,
                  x + file_width - corner_size, y],
                 fill=(*primary_blue, 150))

    # Add file type text
    try:
        font_size = max(int(size * 0.2), 8)
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", font_size)
        except:
            font = ImageFont.load_default()

    # Draw file extension
    text = file_type.upper()
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = x + (file_width - text_width) // 2
    text_y = y + file_height - text_height - int(size * 0.1)

    draw.text((text_x, text_y), text, fill=(255, 255, 255, 255), font=font)

    img.save(output_path, format='ICO' if output_path.endswith('.ico') else 'PNG')
    print(f"Created file type icon: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Generate Mike-AI-IDE icons')
    parser.add_argument('--output-dir', default='../resources',
                        help='Output directory for icons')
    parser.add_argument('--force', action='store_true',
                        help='Overwrite existing icons')

    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, args.output_dir)

    print("🎨 Generating Mike-AI-IDE icons...")

    # Windows icons
    win32_dir = os.path.join(output_dir, 'win32')
    os.makedirs(win32_dir, exist_ok=True)

    # Main application icon
    create_mike_ai_icon(64, os.path.join(win32_dir, 'code.ico'), 'ICO')
    create_mike_ai_icon(150, os.path.join(
        win32_dir, 'code_150x150.png'), 'PNG')
    create_mike_ai_icon(70, os.path.join(win32_dir, 'code_70x70.png'), 'PNG')

    # File type icons
    file_types = ['c', 'cpp', 'csharp', 'css', 'go', 'html', 'java', 'javascript',
                  'json', 'markdown', 'php', 'python', 'typescript', 'xml', 'yaml']

    for file_type in file_types:
        icon_path = os.path.join(win32_dir, f'{file_type}.ico')
        create_file_type_icon(None, file_type, icon_path)

    # macOS icons
    darwin_dir = os.path.join(output_dir, 'darwin')
    os.makedirs(darwin_dir, exist_ok=True)

    # Main application icon (PNG for now, ICNS requires special tools)
    create_mike_ai_icon(512, os.path.join(darwin_dir, 'code.png'), 'PNG')

    # Linux icons
    linux_dir = os.path.join(output_dir, 'linux')
    os.makedirs(linux_dir, exist_ok=True)

    create_mike_ai_icon(128, os.path.join(linux_dir, 'code.png'), 'PNG')

    print("✅ Mike-AI-IDE icons generated successfully!")
    print("📁 Icons saved to:", output_dir)


if __name__ == "__main__":
    main()
