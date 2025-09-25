// HomeRoutes for landing page - simplified for now
import { Navigate } from "react-router-dom";

export function HomeRoutes() {
  // For now, just redirect to predictions
  return <Navigate to="/predictions" replace />;
}
