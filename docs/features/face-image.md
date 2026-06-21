# Face Image Title Card

## Purpose

The face image is the opening title-card scene for a Reel. It gives scene 1 a short, memorable hook while keeping generated visual assets text-free.

## Current Behavior

- Scene 1 must have `is_face_image: true`.
- Scene 1 must have `face_image_title` with 2-5 words.
- Scene 1 should be 4 seconds or shorter.
- The generated image/video prompt for scene 1 must stay text-free.
- The renderer uses `face_image_title` metadata to add the centered title overlay.
- Scenes after scene 1 must have `is_face_image: false` and an empty `face_image_title`.

This supersedes older notes that described embedding title text directly inside the generated image. Current prompt and validation rules reserve title text for renderer overlay metadata.

## Important Files

- [Storyboard schema](../../prompts/storyboard_and_prompts/response-schema.json)
- [Storyboard system prompt](../../prompts/storyboard_and_prompts/system.md)
- [Storyboard user prompt](../../prompts/storyboard_and_prompts/user.md)
- [Story package prompt](../../prompts/story_package_generation/system.md)
- [Story package runner](../../workflows/scripts/run_story_package_generation.mjs)
- [Validation workflow](../../workflows/n8n/wf_validation_check.json)
- [Rendering contract](../architecture/rendering-contract.md)
- [Data model](../architecture/data-model.md)

## Rules

- Use exactly one face image scene, always scene 1.
- Keep `face_image_title` short enough for mobile readability.
- Do not put title placement instructions in `visual_prompt`.
- Do not ask image/video models to generate title text for scene 1.
- Do not add `face_image_title` to later scenes.
- Do not let scene 1 linger longer than the hook needs.

## Validation

The validation workflow checks that:

- storyboard scenes are sequential;
- scene 1 is marked as the face image;
- scene 1 has a 2-5 word `face_image_title`;
- scene 1 duration stays short;
- only scene 1 has title metadata;
- visual prompts do not request visible text, subtitles, logos, lower thirds, or typography.

## Gotchas

- Old feature docs may have described embedded title text. Treat those as obsolete.
- The face image title belongs in metadata, not generated visual content.
- If renderer behavior changes, update this doc, the rendering contract, and storyboard validation together.
