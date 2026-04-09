import re
import os

filepath = '/Users/ajaykowkuntla/.gemini/antigravity/scratch/urbanflow/index.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Clean up spacer hacks
spacer = r'<!-- Spacer to prevent content overlapping with the absolute bottom-nav -->\s*<div style="height: 120px; width: 100%; clear: both; flex-shrink: 0;"></div>'
html = re.sub(spacer, '', html)

# 2. Remove in-screen nav elements so we can elevate them
html = re.sub(r'\s*<nav class="bottom-nav.*?>.*?</nav>', '', html, flags=re.DOTALL)

# 3. Define the new global, sticky navigation system (Flutter Scaffold Style)
global_navs = """
        <!-- Global Citizen Navigation -->
        <nav class="bottom-nav" id="global-citizen-nav" style="display: none;">
            <a class="nav-item active" onclick="navTo('screen-home', this)" id="nav-home">
                <span class="material-icons-outlined">home</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Home</span>
            </a>
            <a class="nav-item" onclick="navTo('screen-reports', this)" id="nav-reports">
                <span class="material-icons-outlined">bar_chart</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Reports</span>
            </a>
            <a class="nav-item" onclick="navTo('screen-heatmap', this)" id="nav-map">
                <span class="material-icons-outlined">map</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Map</span>
            </a>
            <a class="nav-item" onclick="navTo('screen-support', this)" id="nav-support">
                <span class="material-icons-outlined">support_agent</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Support</span>
            </a>
            <a class="nav-item" onclick="navTo('screen-profile', this)" id="nav-profile">
                <span class="material-icons-outlined">person</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Profile</span>
            </a>
        </nav>

        <!-- Global Worker Navigation -->
        <nav class="bottom-nav worker-bottom-nav" id="global-worker-nav" style="display: none;">
            <a class="nav-item active" onclick="navTo('screen-worker-tasks', this)" id="nav-worker-tasks">
                <span class="material-icons-outlined">assignment</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Tasks</span>
            </a>
            <a class="nav-item" onclick="navTo('screen-worker-map', this)" id="nav-worker-map">
                <span class="material-icons-outlined">explore</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Map</span>
            </a>
            <a class="nav-item" onclick="navTo('screen-attendance', this)" id="nav-worker-qr">
                <span class="material-icons-outlined">qr_code_scanner</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Scan</span>
            </a>
            <a class="nav-item" onclick="navTo('screen-worker-profile', this)" id="nav-worker-profile">
                <span class="material-icons-outlined">badge</span>
                <span class="nav-label text-xs font-bold mt-1 uppercase">Profile</span>
            </a>
        </nav>
"""

# Insert these BEFORE the closing app-shell div
html = html.replace('        </div>\n    </div>\n\n    <!-- Minimal script', global_navs + '        </div>\n    </div>\n\n    <!-- Minimal script')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)

print("HTML DOM Re-structured for Global SPA Nav!")
