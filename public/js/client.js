// client.js (ES module)
const socket = io();

// UI elements
const sendBtn = document.getElementById("sendBtn");
const recvBtn = document.getElementById("recvBtn");
const senderSection = document.getElementById("sender-section");
const receiverSection = document.getElementById("receiver-section");
const modeSelect = document.getElementById("mode-select");

const genRoom = document.getElementById("genRoom");
const roomIdSender = document.getElementById("roomIdSender");
const fileInput = document.getElementById("fileInput");
const dropArea = document.getElementById("dropArea");
const startSend = document.getElementById("startSend");
const fileInfo = document.getElementById("fileInfo");
const sendProgress = document.getElementById("sendProgress");

const roomIdReceiver = document.getElementById("roomIdReceiver");
const joinRoom = document.getElementById("joinRoom");
const recvStatus = document.getElementById("recvStatus");
const incomingFile = document.getElementById("incomingFile");
const incomingName = document.getElementById("incomingName");
const recvProgress = document.getElementById("recvProgress");
const downloadBtn = document.getElementById("downloadBtn");

let selectedFile = null;
let currentRoom = null;

// chunk settings
const CHUNK_SIZE = 64 * 1024; // 64KB
// Max recommended demo size (bytes)
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

// util: generate short room id
function makeRoomId() {
  // small readable id
  return Math.random().toString(36).slice(2, 10);
}

function showSection(section) {
  modeSelect.classList.add("hidden");
  if (section === "send") {
    senderSection.classList.remove("hidden");
    receiverSection.classList.add("hidden");
  } else {
    receiverSection.classList.remove("hidden");
    senderSection.classList.add("hidden");
  }
}

sendBtn.onclick = () => {
  showSection("send");
  if (!roomIdSender.value) roomIdSender.value = makeRoomId();
};

recvBtn.onclick = () => {
  showSection("recv");
};

genRoom.onclick = () => {
  roomIdSender.value = makeRoomId();
};

// drop & file input
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("hover");
});
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("hover"));
dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("hover");
  const f = e.dataTransfer.files?.[0];
  handleFileSelected(f);
});

fileInput.addEventListener("change", (e) => handleFileSelected(e.target.files?.[0]));

function handleFileSelected(file) {
  if (!file) return;
  if (file.type !== "application/pdf") {
    alert("Only PDFs are allowed in this demo.");
    return;
  }
  if (file.size > MAX_SIZE) {
    alert("File too large for this demo. Try a smaller file (<25MB).");
    return;
  }
  selectedFile = file;
  fileInfo.textContent = `${file.name} — ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  startSend.disabled = false;
}

// Sender: chunk & send
startSend.addEventListener("click", async () => {
  if (!selectedFile) return alert("Select a PDF first.");
  const roomId = roomIdSender.value || makeRoomId();
  currentRoom = roomId;
  socket.emit("join-room", roomId);

  const fileId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  // let receiver know metadata
  const meta = {
    roomId,
    name: selectedFile.name,
    size: selectedFile.size,
    type: selectedFile.type,
    fileId,
  };
  socket.emit("file-meta", meta);

  // read and send in chunks
  const stream = selectedFile.stream();
  const reader = stream.getReader();
  let seq = 0;
  let sentBytes = 0;

  sendProgress.textContent = "Sending...";
  startSend.disabled = true;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // value is a Uint8Array chunk
    socket.emit("file-chunk", {
      roomId,
      fileId,
      seq: seq++,
      chunk: value.buffer, // ArrayBuffer
    });
    sentBytes += value.length;
    const percent = ((sentBytes / selectedFile.size) * 100).toFixed(1);
    sendProgress.textContent = `Sent ${sentBytes} / ${selectedFile.size} bytes (${percent}%)`;
  }

  socket.emit("file-complete", { roomId, fileId });
  sendProgress.textContent = "File sent (done). Keep room open until receiver finishes.";
});

// Receiver: join room
joinRoom.addEventListener("click", () => {
  const roomId = roomIdReceiver.value.trim();
  if (!roomId) return alert("Enter a room id");
  currentRoom = roomId;
  socket.emit("join-room", roomId);
  recvStatus.textContent = `Joined room ${roomId}. Waiting for file...`;
});


const incomingFiles = {}; 

socket.on("peer-joined", (data) => {

});

socket.on("file-meta", (meta) => {
  // show UI
  incomingFile.classList.remove("hidden");
  incomingName.textContent = meta.name;
  incomingFiles[meta.fileId] = {
    meta,
    chunks: [],
    receivedBytes: 0,
  };
  recvProgress.textContent = `0 / ${meta.size} bytes`;
  downloadBtn.disabled = true;
});


socket.on("file-chunk", async (payload) => {

  const { fileId, seq } = payload;
  if (!incomingFiles[fileId]) {

    incomingFiles[fileId] = { meta: { name: "unknown.pdf", size: 0 }, chunks: [], receivedBytes: 0 };
  }


  const ab = payload.chunk;
 
  const uint8 = new Uint8Array(ab);
  incomingFiles[fileId].chunks.push({ seq, data: uint8 });
  incomingFiles[fileId].receivedBytes += uint8.length;

  const meta = incomingFiles[fileId].meta;
  const total = meta.size || "unknown";
  recvProgress.textContent = `${incomingFiles[fileId].receivedBytes} / ${total} bytes`;

});

// When sender signals complete
socket.on("file-complete", (info) => {
  const { fileId } = info;
  const record = incomingFiles[fileId];
  if (!record) return;
  // sort chunks by seq and concat
  record.chunks.sort((a,b)=>a.seq - b.seq);
  const totalBytes = record.chunks.reduce((sum, c) => sum + c.data.length, 0);
  const tmp = new Uint8Array(totalBytes);
  let offset = 0;
  for (const c of record.chunks) {
    tmp.set(c.data, offset);
    offset += c.data.length;
  }

  const blob = new Blob([tmp.buffer], { type: record.meta.type || "application/pdf" });
  // create download link
  const url = URL.createObjectURL(blob);
  downloadBtn.onclick = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = record.meta.name || "download.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  recvProgress.textContent = `Received ${totalBytes} bytes — ready to download`;
  downloadBtn.disabled = false;
});
