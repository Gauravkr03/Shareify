import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve /public folder correctly
app.use(express.static(path.join(__dirname, "public")));

// simple health route
app.get("/ping", (req, res) => res.send("pong"));

/**
 * Socket.IO flow:
 * - Client joins a room via "join-room" (roomId)
 * - Sender emits "file-meta" (name, size, type, roomId)
 * - Sender splits file into chunks and emits "file-chunk" with sequence number
 * - Server relays "file-meta" and "file-chunk" to other sockets in the room
 * - When done, sender emits "file-complete" -> receiver can reconstruct and download
 *
 * This server only relays messages. It does not store files on disk.
 */

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);
    socket.to(roomId).emit("peer-joined", { peerId: socket.id });
  });

  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    console.log(`${socket.id} left room ${roomId}`);
  });

  socket.on("file-meta", (meta) => {
    // meta: { roomId, name, size, type, fileId }
    if (!meta || !meta.roomId) return;
    socket.to(meta.roomId).emit("file-meta", meta);
  });

  socket.on("file-chunk", (payload) => {
    // payload: { roomId, fileId, seq, chunk } where chunk is ArrayBuffer or base64
    if (!payload || !payload.roomId) return;
    // relay chunk to other peers in room
    socket.to(payload.roomId).emit("file-chunk", payload);
  });

  socket.on("file-complete", (info) => {
    // info: { roomId, fileId }
    if (!info || !info.roomId) return;
    socket.to(info.roomId).emit("file-complete", info);
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
