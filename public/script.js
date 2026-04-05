const socket = io();

const videoGrid = document.getElementById("video-grid");

const name = localStorage.getItem("name");
const roomId = localStorage.getItem("room");

document.getElementById("info").innerText = name + " - Room: " + roomId;

let localStream;
let peers = {};
let videoElements = {}; // 🔥 tránh trùng video

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

// 🎥 Lấy cam + mic
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

// 👥 user cũ
socket.on("all-users", (users) => {
  users.forEach((user) => {
    if (user.id !== socket.id) {
      createPeer(user.id, true);
    }
  });
});

// 👤 user mới
socket.on("user-connected", (user) => {
  createPeer(user.id, false);
});

// ❌ user rời
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
    await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// 🔗 tạo peer
function createPeer(userId, initiator) {
  const peer = new RTCPeerConnection(config);

  peers[userId] = peer;

  localStream.getTracks().forEach((track) => {
    peer.addTrack(track, localStream);
  });

  // 🔥 FIX trùng video
  peer.ontrack = (e) => {
    if (!videoElements[userId]) {
      addVideo(userId, e.streams[0]);
    }
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

// 🎥 add video (FIX full)
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
  if (track) track.enabled = !track.enabled;
}

// 📷 CAMERA
function toggleCam() {
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });
}

// 🖥️ SHARE MÀN HÌNH (FIX)
async function shareScreen() {
  const screen = await navigator.mediaDevices.getDisplayMedia({
    video: true,
  });

  const track = screen.getVideoTracks()[0];

  for (let id in peers) {
    const sender = peers[id].getSenders().find((s) => s.track.kind === "video");

    if (sender) sender.replaceTrack(track);
  }

  // 🔥 update local video
  addVideo("me", new MediaStream([track]), true);

  track.onended = () => {
    const cam = localStream.getVideoTracks()[0];

    for (let id in peers) {
      const sender = peers[id]
        .getSenders()
        .find((s) => s.track.kind === "video");

      if (sender) sender.replaceTrack(cam);
    }

    addVideo("me", localStream, true);
  };
}

// 🚪 rời phòng
function leave() {
  window.location.href = "/";
}
