-- Until now both stations shared the kitchen keys; the bar keeps them.
UPDATE "events" SET "bar_buzzer_key" = "buzzer_key", "bar_buzzer_key_2" = "buzzer_key_2";
