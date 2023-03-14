const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;



// middle ware 
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.udklrtw.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// verify token
function verifyJWt(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        // console.log(decoded)
        req.decoded = decoded;
        next();
    });

}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services)
        })

        app.get('/user', async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        })


        // make user admin 

        app.put('/user/admin/:email', verifyJWt, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'forbidden' })
            }

        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ isAdmin });
        })


        // Warning:
        // This is not the proper way to query
        //After learning more about mongodb. Use aggregate lookup, pipeline, match,group
        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1: get all services

            const services = await serviceCollection.find().toArray();

            // step 2: get the bookin of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each services 
            services.forEach(service => {
                // step 4: find bookings for that service
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                // step 5: select slots for the service bookings
                const bookedSlots = serviceBookings.map(book => book.slot);
                //step 6: select those slots that are not in booked
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
            })
            res.send(services)
        })

        /**
         * API Naming Convention
         * app.get('/booking') /// get all booking in this collection. or get more than one or by filter
         * app.get('booking/:id')///get a specific booking
         * app.post('/booking') /// addd a new booking
         * app.patch('/booking/:id') //specific one  update
         * app.put ('/booking/:id') // upsert ==> update (if exists) or insert (if doesn't exist)
         * app.dalete('/booking/:id) // specific one delete
        */


        app.get('/booking', verifyJWt, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'forbidden Access' })
            }

        });

        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });


        app.get('/doctor', async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        });


        app.post('/doctor', async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });
        app.delete('/doctor/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        });

    }
    finally {

    }
}
run().catch(console.dir)



app.get('/', (req, res) => {
    res.send('Hello From Doctor Uncle!')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})