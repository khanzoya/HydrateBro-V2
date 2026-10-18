import "./App.css";
import { supabase } from "./supaBaseClient";
import { useEffect, useState } from "react";

function App() {
  const [screen, setScreen] = useState("welcome");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [consumed, setConsumed] = useState(0);
  const [date, setDate] = useState(new Date());
  const [userId, setUserId] = useState(null);
  const [history, setHistory] = useState([]);
  const [weeklyAverage, setWeeklyAverage] = useState(0);
  const [totalGlasses, setTotalGlasses] = useState(0);
  const [daysAchieved, setDaysAchieved] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [sidebarOpen, setSideBarOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        console.log("Supabase session found: ", session.user);
      } else {
        console.log("no supabase session.");
      }
    };
    checkSession();

    const getAuthUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log("No authenticated user.");
        setScreen("welcome");
        setIsLoading(false);
        return;
      }

      console.log("Auth user: ", user);

      const { data: profile, error } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", user.id)
        .single();

      console.log("HydrateBro profile:", profile);
      console.log("profile error: ", error);

      if (error || !profile) {
        console.log("Could not load profile:", error);
        setScreen("welcome");
        setIsLoading(false);
        return;
      }

      setUserId(profile.id);
      setName(profile.name);

      const { data: todayRecord, error: recordError } = await supabase
        .from("daily_records")
        .select("*")
        .eq("user_id", profile.id)
        .eq("date", new Date().toISOString().split("T")[0])
        .single();

      console.log("Today's record:", todayRecord);
      console.log("Record error:", recordError);

      if (todayRecord) {
        setGoal(todayRecord.daily_goal);
        setConsumed(todayRecord.glasses_drunk);
        setScreen("dashboard");
        setIsLoading(false);
      } else {
        const { data: previousRecord, error: previousError } = await supabase
          .from("daily_records")
          .select("daily_goal")
          .eq("user_id", profile.id)
          .lt("date", new Date().toISOString().split("T")[0])
          .order("date", { ascending: false })
          .limit(1)
          .single();

        if (previousError || !previousRecord) {
          setScreen("goal");
          setIsLoading(false);
          return;
        }

        const today = new Date().toISOString().split("T")[0];

        const { error: insertError } = await supabase
          .from("daily_records")
          .insert({
            user_id: profile.id,
            date: today,
            daily_goal: previousRecord.daily_goal,
            glasses_drunk: 0,
            status: "In Progress",
          });

        if (insertError) {
          console.log("Could not create today's record:", insertError);
          alert("Could not start today's hydration record.");
          setIsLoading(false);
          return;
        }

        setGoal(previousRecord.daily_goal);
        setConsumed(0);
        setScreen("dashboard");
        setIsLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setIsLoading(true);

        setTimeout(() => {
          getAuthUser();
        }, 0);
      }
      if (event === "SIGNED_OUT") {
        setUserId(null);
        setName("");
        setGoal("");
        setConsumed(0);
        setScreen("welcome");
        setIsLoading(false);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error) {
      console.log(error);
      alert("Login failed.");
      setIsLoading(false);
      return;
    }

    console.log("Logged in: ", data.user);
  };

  const handleContinue = async () => {
    if (name.trim() === "") {
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .insert([{ name: name.trim() }])
      .select()
      .single();

    if (error) {
      console.log(error);
      alert("Something went wrong. Please try again.");
      return;
    }

    setUserId(data.id);
    setScreen("goal");
  };

  const handleGoalContinue = async () => {
    if (Number(goal) <= 0) {
      return;
    }

    const { error } = await supabase.from("daily_records").insert([
      {
        user_id: userId,
        date: new Date().toISOString().split("T")[0],
        daily_goal: Number(goal),
        glasses_drunk: 0,
        status: "In Progress",
      },
    ]);

    if (error) {
      console.log(error);

      if (error.code === "23505") {
        alert("Today's hydration record already exists.");
      } else {
        alert("Could not save your goal.");
      }

      return;
    }

    setScreen("dashboard");
  };

  const handleDrink = async () => {
    const newConsumed = consumed + 1;

    setConsumed(newConsumed);

    let newStatus;

    if (newConsumed < Number(goal)) {
      newStatus = "In Progress";
    } else if (newConsumed === Number(goal)) {
      newStatus = "Goal Achieved";
    } else {
      newStatus = "Goal Exceeded";
    }

    const today = new Date().toISOString().split("T")[0];

    const { error } = await supabase
      .from("daily_records")
      .update({
        glasses_drunk: newConsumed,
        status: newStatus,
      })
      .eq("user_id", userId)
      .eq("date", today);

    if (error) {
      console.log(error);
      alert("Could not save your drink.");
    }
  };

  const getHistory = async () => {
    const { data, error } = await supabase
      .from("daily_records")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (error) {
      console.log("History error:", error);
      return;
    }

    setHistory(data);
    setScreen("history");
  };

  const getWeeklyReport = async () => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);

    const startDate = sevenDaysAgo.toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("daily_records")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    console.log("Weekly data:", data);

    if (error) {
      console.log("Weekly report error:", error);
      return;
    }

    const total = data.reduce((sum, record) => sum + record.glasses_drunk, 0);

    const average = data.length > 0 ? total / data.length : 0;

    const achieved = data.filter(
      (record) =>
        record.status === "Goal Achieved" || record.status === "Goal Exceeded",
    ).length;

    setTotalGlasses(total);
    setWeeklyAverage(average.toFixed(1));
    setDaysAchieved(achieved);
    setScreen("weekly");
  };

  const handleGoalUpdate = async () => {
    if (Number(goal) <= 0) {
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    let newStatus;

    if (consumed < Number(goal)) {
      newStatus = "In Progress";
    } else if (consumed === Number(goal)) {
      newStatus = "Goal Achieved";
    } else {
      newStatus = "Goal Exceeded";
    }

    const { error } = await supabase
      .from("daily_records")
      .update({
        daily_goal: Number(goal),
        status: newStatus,
      })
      .eq("user_id", userId)
      .eq("date", today);

    if (error) {
      console.log(error);
      alert("Could not update your goal.");
      return;
    }

    setEditingGoal(false);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.log("Logout error:", error);
      alert("Could not log out. Please try again.");
      return;
    }

    setUserId(null);
    setName("");
    setGoal("");
    setConsumed(0);
    setHistory([]);
    setSideBarOpen(false);
    setScreen("welcome");
  };

  return (
    <main className='app'>
      {isLoading ? (
        <p>Loading HydrateBro...</p>
      ) : (
        <>
          <h1>HydrateBro </h1>

          {screen === "welcome" && (
            <section>
              <h2>Stay hydrated. Feel better.</h2>
              <p>Track your daily water intake and build a healthy habit.</p>
              <button onClick={() => setScreen("login")}>Get Started</button>
            </section>
          )}

          {screen === "login" && (
            <section>
              <h2>Welcome back!</h2>
              <input
                type='email'
                placeholder='abc@gmail.com'
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />

              <input
                type='password'
                placeholder='Password'
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />

              <button onClick={handleLogin}>Log In</button>
            </section>
          )}

          {screen === "name" && (
            <section>
              <h2>What's your name?</h2>
              <input
                type='text'
                placeholder='Enter your name'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button onClick={handleContinue}>Continue</button>
            </section>
          )}

          {screen === "goal" && (
            <section>
              <h2>Hi, {name}! </h2>
              <p>What's your goal for today?</p>
              <input
                type='number'
                placeholder='Number of glasses'
                min='1'
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
              <button onClick={handleGoalContinue}>Continue</button>
            </section>
          )}

          {screen === "dashboard" && (
            <div className='sidebar-wrapper'>
              {!sidebarOpen && (
                <button
                  className='sidebar-toggle'
                  onClick={() => setSideBarOpen(true)}
                >
                  ☰
                </button>
              )}

              {sidebarOpen && (
                <div className='dashboard-sidebar'>
                  <button
                    className='sidebar-close'
                    onClick={() => setSideBarOpen(false)}
                  >
                    ✕
                  </button>

                  <button onClick={() => setScreen("history")}>History</button>

                  <button onClick={getWeeklyReport}>Weekly Report</button>

                  <button onClick={handleLogout}> Log Out</button>
                </div>
              )}

              <section>
                <h2>Welcome, {name}! </h2>
                <p>Today's Hydration</p>

                <p>
                  {new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>

                <p>Your daily goal: {goal} glasses</p>

                {editingGoal ? (
                  <div>
                    <input
                      type='number'
                      min='1'
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                    />

                    <button onClick={handleGoalUpdate}>save Goal</button>
                  </div>
                ) : (
                  <button
                    className='goaleditbutton'
                    onClick={() => setEditingGoal(true)}
                  >
                    Edit Goal
                  </button>
                )}
                <p>Let's keep you hydrated!</p>

                <h3>
                  {consumed}/{goal} glasses
                </h3>
                <p>
                  {consumed < Number(goal)
                    ? `${Number(goal) - consumed} glasses to go!`
                    : consumed === Number(goal)
                      ? "Goal achieved! 🎉"
                      : "Goal exceeded! 🥳"}
                </p>

                <button onClick={handleDrink}>+ Drink a Glass</button>

                <div className='progress-track'>
                  <div
                    className='progress-fill'
                    style={{
                      width: `${Math.min((consumed / Number(goal)) * 100, 100)}%`,
                    }}
                  ></div>
                </div>

                <p>{Math.round((consumed / Number(goal)) * 100)}% completed</p>
              </section>
            </div>
          )}

          {screen === "history" && (
            <section>
              <h2>Hydration History</h2>

              {history.length === 0 ? (
                <p>No records yet.</p>
              ) : (
                history.map((record) => (
                  <div className='history-card' key={record.id}>
                    <h3>{record.date}</h3>

                    <p>Goal: {record.daily_goal} glasses</p>
                    <p>Drank: {record.glasses_drunk} glasses</p>
                    <p>Status: {record.status}</p>
                  </div>
                ))
              )}

              <button onClick={() => setScreen("dashboard")}>
                Back to Dashboard
              </button>
            </section>
          )}

          {screen === "weekly" && (
            <section>
              <h2>Weekly Report</h2>

              <h3>{totalGlasses}</h3>
              <p>Total Glasses</p>

              <h3>{weeklyAverage}</h3>
              <p>Average glasses per day</p>

              <h3>{daysAchieved}</h3>
              <p>Days goal achieved</p>

              <button onClick={() => setScreen("dashboard")}>
                Back to Dashboard
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default App;
