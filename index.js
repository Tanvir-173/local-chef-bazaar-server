const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000

app.use(express.json())
app.use(cors())

// ----------------------------
// MongoDB Connection
// ----------------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q7tqgdi.mongodb.net/?appName=Cluster0`;



const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ----------------------------
// Run Server & Setup DB
// ----------------------------
async function run() {
  try {
    await client.connect();

    const db = client.db("localchefbazaar_db");
    const mealsCollection = db.collection("meals");
    const reviewsCollection = db.collection("reviews");
    const favoritesCollection = db.collection("favorites");
    const ordersCollection = db.collection("order_collection");
    const usersCollection = db.collection("users");
    const roleRequestsCollection = db.collection("role_requests");



    // Add user when they register or first login
    //========================================
    app.post("/users", async (req, res) => {
      const user = req.body; // { name, email, photoURL, role? }
      try {
        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email: user.email });
        if (existingUser) return res.send({ message: "User already exists", user: existingUser });

        // Insert new user
        const result = await usersCollection.insertOne({
          ...user,
          role: "user", // default role
          status: "active",
        });
        res.send({ message: "User created successfully", user: result });
      } catch (err) {
        console.log(err);
        res.status(500).send({ error: "Failed to create user" });
      }
    });


    // ----------------------------
    // 📌 POST Meals
    // ----------------------------
    app.post("/meals", async (req, res) => {
      const mealData = req.body;
      const result = await mealsCollection.insertMany(mealData);
      res.send(result);
    });

    // ----------------------------
    // 📌 GET All Meals
    // ----------------------------
    app.get("/meals", async (req, res) => {
      const meals = await mealsCollection.find().toArray();
      res.send(meals);
    });

    // ----------------------------
    // 📌 GET Single Meal by ID
    // ----------------------------
    app.get("/meals/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });

        if (!meal) {
          return res.status(404).send({ error: "Meal not found" });
        }

        res.send(meal);

      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Invalid Meal ID" });
      }
    });

    // =================================================================
    // ⭐⭐ REVIEWS APIs ⭐⭐
    // =================================================================

    // ----------------------------
    // 📌 GET Reviews for a Meal
    // ----------------------------
    app.get("/reviews/:mealId", async (req, res) => {
      const mealId = req.params.mealId;

      const reviews = await reviewsCollection
        .find({ foodId: mealId })
        .sort({ date: -1 })
        .toArray();

      res.send(reviews);
    });

    // ----------------------------
    // 📌 POST Review for a Meal
    // ----------------------------
    app.post("/reviews", async (req, res) => {
      const reviewData = req.body;  // full object from frontend

      reviewData.date = new Date(); // Auto timestamp

      const result = await reviewsCollection.insertOne(reviewData);
      res.send(result);
    });

    // =================================================================
    // ⭐⭐ FAVORITES APIs ⭐⭐
    // =================================================================

    // ----------------------------
    // 📌 POST Add to Favorites
    // ----------------------------
    app.post("/favorites", async (req, res) => {
      const favorite = req.body;

      const exists = await favoritesCollection.findOne({
        userEmail: favorite.userEmail,
        mealId: favorite.mealId,
      });

      if (exists) {
        return res.send({ message: "Already added", inserted: false });
      }

      favorite.addedTime = new Date();

      const result = await favoritesCollection.insertOne(favorite);
      res.send({ inserted: true, result });
    });

    // ----------------------------
    // 📌 GET Favorites by User Email
    // ----------------------------
    app.get("/favorites/:email", async (req, res) => {
      const email = req.params.email;

      const items = await favoritesCollection
        .find({ userEmail: email })
        .sort({ addedTime: -1 })
        .toArray();

      res.send(items);
    });

    // POST: Create a new order
    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;
        order.orderStatus = "pending";
        order.orderTime = new Date();

        const result = await ordersCollection.insertOne(order);
        res.send({ success: true, orderId: result.insertedId });
      } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, message: "Failed to place order" });
      }
    });

    // verfy-paymetnt
    // ===========================
    // PATCH order payment status
    app.patch("/orders/:id/paid", async (req, res) => {
      const { id } = req.params; // order _id
      const { sessionId } = req.body; // optional, from Stripe

      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === "paid") {
          const result = await ordersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { paymentStatus: "paid" } }
          );

          return res.send({ success: true, message: "Payment verified & updated", result });
        }

        res.status(400).send({ success: false, message: "Payment not completed" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: err.message });
      }
    });


    // GET: Orders by user email
    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const orders = await ordersCollection.find({ userEmail: email }).toArray();
      res.send(orders);
    });

    // GET pending orders for a chef
    app.get("/chef-orders/:chefId", async (req, res) => {
      const { chefId } = req.params;
      console.log("Chef ID received:", chefId);

      const orders = await ordersCollection
        .find({ chefId: chefId, orderStatus: "pending" }) // exact match
        .toArray();

      console.log("Orders found:", orders);
      res.send(orders);
    });

    // PATCH /orders/:id/paid
    // ----------------------------
    app.patch("/orders/:id/paid", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { paymentStatus: "paid" } }
        );

        res.send({ success: true, result });
      } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, message: "Failed to mark order as paid" });
      }
    });



    // PATCH order status by chef
    app.patch("/orders/:id", async (req, res) => {
      const { id } = req.params;
      const { orderStatus } = req.body; // accepted / rejected

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus } }
        );

        res.send({ success: true, result });
      } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, message: "Failed to update order" });
      }
    });

    //user emaile role
    //=========================

    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });
        res.send({ role: user.role });
      } catch (error) {
        res.status(500).send({ error: "Server error" });
      }
    });


    // ----------------------------
    // 📌 GET API: Get user info by email
    // ----------------------------
    app.get("/users/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });
        res.send(user);
      } catch (error) {
        res.status(500).send({ error: "Server error" });
      }
    });

    // ----------------------------
    // 📌 POST API: Send role upgrade request
    // ----------------------------
    app.post("/role-request", async (req, res) => {
      const requestData = req.body;
      try {
        requestData.requestStatus = "pending";
        requestData.requestTime = new Date();

        const result = await roleRequestsCollection.insertOne(requestData);
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ error: "Failed to submit request" });
      }
    });

    // GET all role requests (Admin)
    app.get("/role-requests", async (req, res) => {
      const requests = await roleRequestsCollection.find().sort({ requestTime: -1 }).toArray();
      res.send(requests);
    });


    // Stripe payment 
    //==========================
    // POST /create-payment-intent
    // ----------------------------
    // app.post("/create-checkout-session", async (req, res) => {
    //   const paymentInfo = req.body;
    //   const amount=paymentInfo.price
    //   const session = await stripe.checkout.sessions.create({line_items: [
    //   {
    //       price_data: {
    //       currency:'USD',
    //       unit_amount:amount,
    //     },
    //     quantity: 1,
    //   },
    // ],
    // mode: 'payment',
    // success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,

    // cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,

    // })

    //       console.log(session)
    //       res.send({ url: session.url})

    // });
    app.post("/create-checkout-session", async (req, res) => {
      const { price, orderId, userEmail } = req.body;
      const amount = parseInt(price) * 100; // convert to cents

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              product_data: { name: "Food Order" }, // REQUIRED
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: { orderId, userEmail },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });



    // PATCH approve or reject request
    app.patch("/role-request/:id", async (req, res) => {
      const { id } = req.params;       // role request ID (string)
      const { action } = req.body;     // "approve" or "reject"

      // Find the request
      const request = await roleRequestsCollection.findOne({ _id: id });
      if (!request) return res.status(404).send({ error: "Request not found" });

      // Approve logic
      if (action === "approve") {
        const updateData = { role: request.requestType };

        // If the request type is 'chef', generate a chefId
        if (request.requestType === "chef") {
          // You can generate a unique chefId (example: "CH-xxx")
          const lastChef = await usersCollection
            .find({ chefId: { $exists: true } })
            .sort({ chefId: -1 })
            .limit(1)
            .toArray();

          let newChefId = "CH-101"; // default starting ID
          if (lastChef.length > 0) {
            // increment last chefId number
            const lastIdNum = parseInt(lastChef[0].chefId.split("-")[1]);
            newChefId = `CH-${lastIdNum + 1}`;
          }

          updateData.chefId = newChefId;
        }

        // Update user's role and chefId if applicable
        await usersCollection.updateOne(
          { email: request.userEmail },
          { $set: updateData }
        );
      }

      // Delete the role request after action
      await roleRequestsCollection.deleteOne({ _id: id });

      res.send({ success: true });
    });

    // GET reviews for a specific user
    app.get("/reviews/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const reviews = await reviewsCollection
          .find({ userEmail: email })
          .sort({ date: -1 })
          .toArray();
        res.send(reviews);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch reviews" });
      }
    });

    // DELETE a review by _id
    app.delete("/reviews/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: result.deletedCount > 0 });
      } catch (err) {
        res.status(500).send({ error: "Failed to delete review" });
      }
    });

    // PATCH review by _id
    app.patch("/reviews/:id", async (req, res) => {
      const { id } = req.params;
      const { rating, comment } = req.body;

      try {
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { rating, comment, date: new Date() } }
        );
        res.send({ success: result.modifiedCount > 0 });
      } catch (err) {
        res.status(500).send({ error: "Failed to update review" });
      }
    });





    // ----------------------------
    // Server Ping
    // ----------------------------
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully Connected to MongoDB!");
  } finally {
    // Do not close connection
  }
}

run().catch(console.dir);

// ----------------------------
// Default Route
// ----------------------------
app.get('/', (req, res) => {
  res.send('Local Chef Bazaar API Running!')
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});
