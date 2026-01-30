import asyncio
import unittest

from app.scheduler.pull_schedule_config import IntervalPullRule, PullScheduleConfig
from app.scheduler.pull_schedule_state import set_current_pull_schedule_config
from app.services.run_pull_service import RunPullService


class TestRunPullServiceTrigger(unittest.IsolatedAsyncioTestCase):
    def tearDown(self) -> None:
        set_current_pull_schedule_config(None)

    def test_get_active_schedule_modes_uses_schedule_config(self) -> None:
        service = RunPullService()
        self.assertTrue(
            hasattr(service, "get_active_schedule_modes"),
            "RunPullService must expose get_active_schedule_modes()",
        )

        set_current_pull_schedule_config(
            PullScheduleConfig(
                enabled=True,
                rules=[
                    IntervalPullRule(
                        id="immediate",
                        enabled=True,
                        schedule_modes=["immediate"],
                        seconds=1,
                        start_immediately=False,
                    )
                ],
            )
        )

        modes = service.get_active_schedule_modes()  # type: ignore[attr-defined]
        self.assertEqual(modes, ["immediate"])

    async def test_trigger_poll_debounces_and_merges_schedule_modes(self) -> None:
        service = RunPullService()
        self.assertTrue(
            hasattr(service, "trigger_poll"),
            "RunPullService must expose trigger_poll()",
        )

        called: list[list[str]] = []

        async def fake_poll(*, schedule_modes: list[str] | None = None) -> None:
            called.append(list(schedule_modes or []))

        service.poll = fake_poll  # type: ignore[method-assign]
        service._trigger_debounce_seconds = 0.01  # type: ignore[attr-defined]

        accepted1 = service.trigger_poll(  # type: ignore[attr-defined]
            schedule_modes=["immediate"],
            reason="test-1",
        )
        accepted2 = service.trigger_poll(  # type: ignore[attr-defined]
            schedule_modes=["scheduled"],
            reason="test-2",
        )
        accepted3 = service.trigger_poll(  # type: ignore[attr-defined]
            schedule_modes=["scheduled"],
            reason="test-3",
        )

        self.assertTrue(accepted1)
        self.assertTrue(accepted2)
        self.assertFalse(accepted3)

        await asyncio.sleep(0.05)

        self.assertEqual(len(called), 1)
        self.assertEqual(set(called[0]), {"immediate", "scheduled"})

