# 🎬 Telegram Movie Downloader & Streamer

A powerful Telegram bot that searches for movies via torrents, downloads them to a server, and uploads them directly to a Telegram Channel. It caches files in a MongoDB database, so future searches for the same movie are delivered instantly without re-downloading.

<img width="948" height="1250" alt="image" src="https://github.com/user-attachments/assets/25cbb6d4-50d4-4341-9684-1407a8d36e9f" />

## ✨ Features

* **Torrent Search:** Scrapes public torrent providers (ThePirateBay, 1337x, etc.) for movies.
* **Smart Caching:** Checks MongoDB first. If a movie was downloaded previously, it sends the file immediately.
* **Bypass 2GB Limit:** Uses a **Userbot (GramJS)** alongside the standard Bot API to upload files larger than 2GB.
* **Non-Blocking Downloads:** Spawns a separate child process (`worker.js`) for downloading/uploading so the main bot remains responsive.
* **Auto-Indexing:** Automatically detects files uploaded to the storage channel and links them to the database.

## 🛠️ Tech Stack

* **Node.js** - Runtime environment.
* **Telegraf** - Framework for the main Bot interface.
* **GramJS (Telegram Client)** - Used to act as a "User" to upload large files.
* **WebTorrent** - For downloading magnet links.
* **Mongoose** - For storing movie metadata and file IDs.
* **Torrent-Search-API** - For finding magnet links.

---

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone [https://github.com/ghdbashen/movie-downloader-.git](https://github.com/ghdbashen/movie-downloader-.git)
cd movie-downloader-
