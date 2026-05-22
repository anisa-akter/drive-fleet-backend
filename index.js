import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import { toNodeHandler } from 'better-auth/node';
import { createAuth } from './auth.js';
import { createVerifyToken } from './middlewares/authMiddleware.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: [process.env.CLIENT_URL],
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(cookieParser());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const db = client.db('driveFleetDB');
    const carsCollection = db.collection('cars');
    const bookingsCollection = db.collection('bookings');

    const auth = createAuth(db);
    const verifyToken = createVerifyToken(auth);

    app.all('/api/auth/{*any}', toNodeHandler(auth));
    app.use(express.json());

   

    app.get('/cars', async (req, res) => {
      const { search, carType } = req.query;
      let query = {};

      if (search) {
        query.carName = { $regex: search, $options: 'i' }; 
      }
      if (carType && carType !== 'All') {
        query.carType = carType;
      }

      const result = await carsCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/cars/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carsCollection.findOne(query);
      res.send(result);
    });

    app.post('/add-car', verifyToken, async (req, res) => {
      const carData = req.body;
      const result = await carsCollection.insertOne({
        ...carData,
        bookingCount: 0 
      });
      res.send(result);
    });

    app.get('/my-cars', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (req.user.email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const query = { ownerEmail: email };
      const result = await carsCollection.find(query).toArray();
      res.send(result);
    });

    app.put('/update-car/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedCar = req.body;
      const updateDoc = {
        $set: {
          dailyPrice: updatedCar.dailyPrice,
          description: updatedCar.description,
          availability: updatedCar.availability,
          imageUrl: updatedCar.imageUrl,
          carType: updatedCar.carType,
          location: updatedCar.location,
        },
      };
      const result = await carsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete('/delete-car/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carsCollection.deleteOne(query);
      res.send(result);
    });


    app.post('/bookings', verifyToken, async (req, res) => {
      const bookingData = req.body;
      
      const bookingResult = await bookingsCollection.insertOne(bookingData);

      const carFilter = { _id: new ObjectId(bookingData.carId) };
      const updateDoc = {
        $inc: { bookingCount: 1 }
      };
      await carsCollection.updateOne(carFilter, updateDoc);

      res.send(bookingResult);
    });

    app.get('/my-bookings', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (req.user.email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const query = { userEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    console.log("Connected successfully to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('DriveFleet Server is running...');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
