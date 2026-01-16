import { useState, useEffect } from "react";
import { skillsService } from "@/features/skills/services/skills-service";
import type { Skill } from "@/features/skills/types";

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const data = await skillsService.list();
        setSkills(data);
      } catch (error) {
        console.error("Failed to fetch skills", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSkills();
  }, []);

  return {
    skills,
    isLoading,
  };
}
