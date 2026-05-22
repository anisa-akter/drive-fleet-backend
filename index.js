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

    const normalizeCar = (car) => {
      if (!car) return null;
      return {
        ...car,
        name: car.name ?? car.carName,
        type: car.type ?? car.carType,
        price: car.price ?? car.dailyPrice,
        available: car.available ?? car.availability,
        seats: car.seats ?? car.seatCapacity,
        location: car.location ?? car.pickupLocation,
        imageUrl: car.imageUrl ?? car.image,
      };
    };

    const auth = createAuth(db);
    const verifyToken = createVerifyToken(auth);

    app.all('/api/auth/{*any}', toNodeHandler(auth));
    app.use(express.json());

   

    app.get('/cars', async (req, res) => {
      const { search, type, carType, limit } = req.query;
      const requestedType = type || carType;
      const filters = [];

      if (search) {
        filters.push({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { carName: { $regex: search, $options: 'i' } },
          ],
        });
      }

      if (requestedType && requestedType !== 'All') {
        filters.push({
          $or: [
            { type: requestedType },
            { carType: requestedType },
          ],
        });
      }

      const query = filters.length ? { $and: filters } : {};
      const limitValue = Number.parseInt(limit, 10);
      let cursor = carsCollection.find(query);
      if (!Number.isNaN(limitValue) && limitValue > 0) {
        cursor = cursor.limit(limitValue);
      }
      const result = await cursor.toArray();
      res.send({ cars: result.map(normalizeCar) });
    });

    app.get('/cars/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carsCollection.findOne(query);
      res.send({ car: normalizeCar(result) });
    });

    app.post('/add-car', verifyToken, async (req, res) => {
      const carData = req.body;
      const result = await carsCollection.insertOne({
        ...carData,
        ownerEmail: req.user.email,
        bookingCount: 0,
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get('/my-cars', verifyToken, async (req, res) => {
      const query = { ownerEmail: req.user.email };
      const result = await carsCollection.find(query).toArray();
      res.send({ cars: result.map(normalizeCar) });
    });

    
    app.put('/update-car/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedCar = req.body;
      const existingCar = await carsCollection.findOne(filter);

      if (!existingCar) {
        return res.status(404).send({ message: 'Car not found' });
      }

      if (existingCar.ownerEmail && existingCar.ownerEmail !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const updateDoc = {
        $set: {
          price: updatedCar.price,
          dailyPrice: updatedCar.price,
          description: updatedCar.description,
          available: updatedCar.available,
          availability: updatedCar.available,
          imageUrl: updatedCar.imageUrl,
          type: updatedCar.type,
          carType: updatedCar.type,
          location: updatedCar.location,
        },
      };
      const result = await carsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete('/delete-car/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const existingCar = await carsCollection.findOne(query);

      if (!existingCar) {
        return res.status(404).send({ message: 'Car not found' });
      }

      if (existingCar.ownerEmail && existingCar.ownerEmail !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const result = await carsCollection.deleteOne(query);
      res.send(result);
    });


    app.post('/bookings', verifyToken, async (req, res) => {
      const bookingData = req.body;
      const carId = bookingData.carId;
      const carFilter = { _id: new ObjectId(carId) };
      const car = await carsCollection.findOne(carFilter);

      if (!car) {
        return res.status(404).send({ message: 'Car not found' });
      }

      const normalizedCar = normalizeCar(car);
      const dailyPrice = Number(normalizedCar.price) || 0;

      const bookingPayload = {
        carId,
        carName: normalizedCar.name,
        carType: normalizedCar.type,
        pickupLocation: normalizedCar.location,
        totalPrice: dailyPrice,
        driverNeeded: Boolean(bookingData.driverNeeded),
        note: bookingData.note || '',
        userEmail: req.user.email,
        createdAt: new Date(),
      };

      const bookingResult = await bookingsCollection.insertOne(bookingPayload);

      await carsCollection.updateOne(carFilter, { $inc: { bookingCount: 1 } });

      res.send(bookingResult);
    });

    app.get('/my-bookings', verifyToken, async (req, res) => {
      const query = { userEmail: req.user.email };
      const result = await bookingsCollection.find(query).toArray();
      res.send({ bookings: result });
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
