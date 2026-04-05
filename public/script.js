const socket = io();

const videoGrid = document.getElementById("video-grid");

const name = localStorage.getItem("name");
const roomId = localStorage.getItem("room");

document.getElementById("info").innerText = name + " - Room: " + roomId;

let localStream;
let peers = {};
let videoElements = {}; // tránh trùng video

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

// 🎥 LẤY MEDIA
async function getMedia() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
  }
}

// 🚀 START
getMedia().then((stream) => {
  localStream = stream;
  addVideo("me", stream, true);

  socket.emit("join-room", { roomId, name });
});

// 👥 DANH SÁCH USER
socket.on("all-users", (users) => {
  users.forEach((user) => {
    if (user.id !== socket.id) {
      createPeer(user.id, true);
    }
  });
});

// 👤 USER MỚI
socket.on("user-connected", (user) => {
  createPeer(user.id, false);
});

// ❌ USER RỜI
socket.on("user-disconnected", (id) => {
  if (videoElements[id]) {
    videoElements[id].remove();
    delete videoElements[id];
  }

  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
});

// 🔁 SIGNAL
socket.on("signal", async ({ from, data }) => {
  let peer = peers[from];

  if (!peer) {
    peer = createPeer(from, false);
  }

  if (data.sdp) {
    await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));

    if (data.sdp.type === "offer") {
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("signal", {
        to: from,
        data: { sdp: peer.localDescription },
      });
    }
  }

  if (data.candidate) {
    try {
      await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.log("ICE error", e);
    }
  }
});

// 🔗 TẠO PEER
function createPeer(userId, initiator) {
  if (peers[userId]) return peers[userId];

  const peer = new RTCPeerConnection(config);
  peers[userId] = peer;

  // add stream
  localStream.getTracks().forEach((track) => {
    peer.addTrack(track, localStream);
  });

  // nhận video + audio
  peer.ontrack = (e) => {
    const stream = e.streams[0];
    addVideo(userId, stream);
  };

  peer.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("signal", {
        to: userId,
        data: { candidate: e.candidate },
      });
    }
  };

  if (initiator) {
    peer.createOffer().then((offer) => {
      peer.setLocalDescription(offer);
      socket.emit("signal", {
        to: userId,
        data: { sdp: offer },
      });
    });
  }

  return peer;
}

// 🎥 HIỂN VIDEO (FIX TRÙNG)
function addVideo(id, stream, mute = false) {
  if (videoElements[id]) return;

  const video = document.createElement("video");
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = mute;

  videoGrid.append(video);
  videoElements[id] = video;
}

// 🎤 MIC
function toggleMic() {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
}

// 📷 CAM
function toggleCam() {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
}

// 🚪 RỜI
function leave() {
  window.location.href = "/";
}

// 🖥️ SHARE
async function shareScreen() {
  const screen = await navigator.mediaDevices.getDisplayMedia({
    video: true,
  });

  const track = screen.getVideoTracks()[0];

  for (let id in peers) {
    const sender = peers[id].getSenders().find((s) => s.track.kind === "video");

    if (sender) sender.replaceTrack(track);
  }

  track.onended = () => {
    const cam = localStream.getVideoTracks()[0];

    for (let id in peers) {
      const sender = peers[id]
        .getSenders()
        .find((s) => s.track.kind === "video");

      if (sender) sender.replaceTrack(cam);
    }
  };
}
