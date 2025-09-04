
# Planning Poker – Realtime (Socket.IO)

Proyecto full‑stack listo para correr localmente.

## Estructura
- `server/` Node.js + Express + Socket.IO
- `client/` React + Vite + socket.io-client

## Requisitos
- Node.js 18+

## Pasos
1. **Servidor**
   ```bash
   cd server
   npm i
   npm run start
   # Servirá en http://localhost:4000
   ```

2. **Cliente**
   En otra terminal:
   ```bash
   cd client
   npm i
   echo VITE_SERVER_URL=http://localhost:4000 > .env
   npm run dev
   # Abre http://localhost:5173
   ```

3. **Uso**
   - Crea una sala, comparte el **código** (o el enlace con `?room=XXXXXX`).
   - Cada persona se une con su **nombre** y **rol**.
   - Agrega historias, voten, revela y fija la estimación final.
   - El temporizador se sincroniza entre dispositivos.

> Nota: El estado es en memoria del servidor (más simple). Para producción usa un store como Redis o una base de datos.
