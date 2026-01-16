import { useState, useEffect } from "react";
import { userService } from "@/features/user/services/user-service";
import type { UserProfile, UserCredits } from "@/features/user/types";

export function useUserAccount() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const [profileData, creditsData] = await Promise.all([
          userService.getProfile(),
          userService.getCredits(),
        ]);

        setProfile(profileData);
        setCredits(creditsData);
      } catch (error) {
        console.error("Failed to fetch user data", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  return {
    profile,
    credits,
    isLoading,
  };
}
