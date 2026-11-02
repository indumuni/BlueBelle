import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>web-react</h1>
      <p>BlueBelle playground sample app.</p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Count is {count}
      </button>
    </main>
  );
}
