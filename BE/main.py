from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import base64
import cv2
import numpy as np
import tensorflow as tf
import json
import os

model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    try:
        # Load model from parent directory
        model_path = os.path.join(os.path.dirname(__file__), '..', 'brain_tumor_unet.keras')
        model = tf.keras.models.load_model(model_path, compile=False)
        print("✅ AI Model loaded successfully")
    except Exception as e:
        print(f"❌ Error loading model: {e}")
    yield
    # Clear model memory on shutdown if needed
    model = None

app = FastAPI(title="mri-segmentation be", lifespan=lifespan)

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to mri-segmentation API"}

def process_image(base64_string):
    # Remove header if present (e.g., data:image/jpeg;base64,)
    if "," in base64_string:
        base64_string = base64_string.split(",")[1]
    
    # Decode base64 to image
    img_data = base64.b64decode(base64_string)
    nparr = np.frombuffer(img_data, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    
    # Resize to match U-Net input
    img_resized = cv2.resize(img_rgb, (256, 256))
    
    # Preprocess
    img_input = img_resized.astype(np.float32) / 255.0
    img_input = np.expand_dims(img_input, axis=0)
    
    return img_input, img_resized

def predict_mask(img_input):
    if model is None:
        raise Exception("Model not loaded")
    
    prediction = model.predict(img_input)[0]
    mask_pred = (prediction > 0.5).astype(np.uint8) * 255
    return mask_pred

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "predict":
                    base64_img = msg.get("image")
                    
                    # Process and predict
                    img_input, original_resized = process_image(base64_img)
                    mask_pred = predict_mask(img_input)
                    
                    # Create Red overlay
                    overlay = np.zeros_like(original_resized)
                    overlay[:, :, 0] = np.squeeze(mask_pred) # Red channel
                    
                    # Blend original and overlay
                    blended = cv2.addWeighted(original_resized, 1.0, overlay, 0.5, 0)
                    
                    # Encode mask and blended to base64
                    _, buffer_mask = cv2.imencode('.png', mask_pred)
                    mask_b64 = base64.b64encode(buffer_mask).decode('utf-8')
                    
                    # cv2 uses BGR for encoding, so convert blended back to BGR
                    blended_bgr = cv2.cvtColor(blended, cv2.COLOR_RGB2BGR)
                    _, buffer_blended = cv2.imencode('.jpg', blended_bgr)
                    blended_b64 = base64.b64encode(buffer_blended).decode('utf-8')
                    
                    # Calculate tumor pixel percentage for frontend warning
                    total_pixels = mask_pred.size
                    tumor_pixels = int(np.sum(mask_pred > 0))
                    tumor_percent = (tumor_pixels / total_pixels) * 100

                    await websocket.send_json({
                        "status": "success",
                        "mask": f"data:image/png;base64,{mask_b64}",
                        "overlay": f"data:image/jpeg;base64,{blended_b64}",
                        "tumor_pixel_percent": round(tumor_percent, 4)
                    })
                else:
                    await websocket.send_json({"status": "error", "message": "Unknown message type"})
            except Exception as e:
                print(f"Error during prediction: {e}")
                await websocket.send_json({"status": "error", "message": str(e)})
                
    except WebSocketDisconnect:
        print("Client disconnected")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
