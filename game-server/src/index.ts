import express from 'express';
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dbConnect from './lib/db';
import Room from './lib/models/Room';

const port = process.env.PORT || 3001;
const app = express();
app.use(cors());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*", // In production, restrict this to your Vercel URL
    methods: ["GET", "POST"]
  }
});

app.get('/health', (req, res) => {
  res.send('Game server is running');
});

io.on("connection", (socket: Socket) => {
  console.log("Client connected:", socket.id);

  socket.on("joinRoom", async ({ roomId, userId }) => {
    console.log(`User ${userId} joining room ${roomId}`);
    try {
      // Connect to DB and check room
      await dbConnect();
      // Use findById properly if roomId is ObjectId, but for MVP it might be a custom string.
      // We will allow arbitrary strings for now to ensure MVP doesn't break if it's not an ObjectId.
      // If it's a valid ObjectId, this will check. If not, we just join.
      let room = null;
      if (roomId.length === 24) {
        room = await Room.findById(roomId);
      }
      
      if (room) {
        if (!room.playerIds.includes(userId)) {
          room.playerIds.push(userId);
          await room.save();
        }
      }
      
      // Always join the socket to the room to allow direct testing without DB strictness
      socket.join(roomId);
      io.to(roomId).emit("playerJoined", { userId });
      
    } catch (err) {
      console.error("Error joining room:", err);
    }
  });

  socket.on("gameAction", ({ roomId, playerId, action }) => {
    // Broadcast action to everyone in the room
    io.to(roomId).emit("gameUpdate", { playerId, action });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

httpServer.listen(port, () => {
  console.log(`> Game Server running on http://localhost:${port}`);
});
