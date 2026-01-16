import { useState, useEffect } from "react";
import {
  getUserCreditsAction,
  getUserProfileAction,
} from "@/features/user/actions/user-actions";
import type { UserProfile, UserCredits } from "@/features/user/types";

export function useUserAccount() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // // TODO: User API temporarily disabled
  // useEffect(() => {
  //   const fetchUserData = async () => {
  //     try {
  //       const [profileData, creditsData] = await Promise.all([
  //         getUserProfileAction(),
  //         getUserCreditsAction(),
  //       ]);

  //       setProfile(profileData);
  //       setCredits(creditsData);
  //     } catch (error) {
  //       console.error("Failed to fetch user data", error);
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   };

  //   fetchUserData();
  // }, []);

  return {
    profile,
    credits,
    isLoading,
  };
}
