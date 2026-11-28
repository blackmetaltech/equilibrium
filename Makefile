# EQUILIBRIUM: day-to-day commands. Run `make help`.
# Plain POSIX make + bash. No paths outside this repo are assumed; the GPU settings come from core/qa/gpu-shot.sh.

SHELL := /bin/bash
.SHELLFLAGS := -eo pipefail -c
.DEFAULT_GOAL := help

GAME      := EQUILIBRIUM
GODOT     ?= godot
WIN       ?= 1000x640
RUN_LOG   ?= build/run.log
SIDECAR   := godot/sidecar/bridge.mjs
IMPORTED  := godot/.godot/global_script_class_cache.cfg
SRCS      := $(shell find src core/ts -type f 2>/dev/null) vite.bridge.config.ts package.json

# Game-specific switches (the only block that differs between the games).
NOSAVE_ENV  := CB_NOAUTOSAVE=1
CLASSIC_ENV := CB_LOOK2=0
LEVEL_ENV    = CB_AUTOSTART=learner CB_LEVEL=$(LEVEL)

# Rendering. Default: Forward+ on the NVIDIA GPU (the desktop itself runs on the integrated AMD GPU, and the user
# environment may point VK_ICD_FILENAMES at a missing file, which silently drops Godot to software rendering).
# LOW=1: compatibility renderer on the integrated GPU.
NVIDIA_ICD ?= /usr/share/vulkan/icd.d/nvidia_icd.json
ifdef LOW
RENDER  := gl_compatibility
GPU_ENV := -u VK_ICD_FILENAMES
else
RENDER  := forward_plus
GPU_ENV := VK_ICD_FILENAMES=$(NVIDIA_ICD) __NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only
endif
RUN_ENV :=
ifdef CLASSIC
RUN_ENV += $(CLASSIC_ENV)
endif
ifdef LEVEL
RUN_ENV += $(LEVEL_ENV) $(NOSAVE_ENV)
endif
# SAVE=tour: a separate data folder (build/tour-data) with every chapter and the Career open. Your own save, settings and Career are not touched.
TOUR_DIR := $(CURDIR)/build/tour-data
ifeq ($(SAVE),tour)
RUN_ENV += XDG_DATA_HOME=$(TOUR_DIR) CB_UNLOCK_ALL=1
endif

.PHONY: help run build test flows shots clean distclean deps import

help: ## List the targets
	@echo "$(GAME): make <target>"
	@awk 'BEGIN{FS=":.*## "} /^[a-zA-Z_-]+:.*## /{printf "  make %-10s %s\n",$$1,$$2}' $(MAKEFILE_LIST)
	@echo "Options for run:  SAVE=tour (a separate save with every chapter open; yours is not touched)"
	@echo "                  LOW=1 (compatibility renderer, integrated GPU)  CLASSIC=1 (classic look)"
	@echo "                  LEVEL=<id> (open a level; the run does not touch your save)  WIN=WxH (window size, default $(WIN))"

deps:
	@test -d core/ts || { echo "core/ is empty: run 'git submodule update --init' (needs access to the core repo)"; exit 1; }
	@test -d node_modules || pnpm install --frozen-lockfile

$(SIDECAR): $(SRCS) | deps
	npx vite build -c vite.bridge.config.ts

$(IMPORTED): | deps
	@mkdir -p build
	$(GODOT) --headless --path godot --import >build/import.log 2>&1 || { tail -20 build/import.log; exit 1; }

import:
	@mkdir -p build
	$(GODOT) --headless --path godot --import >build/import.log 2>&1 || { tail -20 build/import.log; exit 1; }

build: $(SIDECAR) import ## Build the engine sidecar and run the Godot import

run: $(SIDECAR) $(IMPORTED) ## Play the game in a window (Forward+ on the NVIDIA GPU)
	@mkdir -p build $(if $(filter tour,$(SAVE)),$(TOUR_DIR))
	@if [ -z "$(LOW)" ] && [ ! -f "$(NVIDIA_ICD)" ]; then echo "run: $(NVIDIA_ICD) not found; the game will use whatever GPU Vulkan finds"; fi
	@echo "starting $(GAME) ($(RENDER)); log: $(RUN_LOG)"
	cd godot && env DISPLAY=$${DISPLAY:-:0.0} $(GPU_ENV) $(RUN_ENV) $(GODOT) --path . --rendering-method $(RENDER) --windowed --resolution $(WIN) 2>&1 | tee ../$(RUN_LOG)

test: | deps ## Typecheck and run the unit tests (4 workers)
	npx tsc --noEmit
	npx vitest run --maxWorkers=4 --minWorkers=1

flows: $(SIDECAR) $(IMPORTED) ## Run the Godot flow suite (strict shared runner)
	bash scripts/flows.sh build/flows

shots: $(SIDECAR) $(IMPORTED) ## Contact sheets of every chapter and the Career on the NVIDIA GPU into build/shots (CH="5 6" for some)
	@mkdir -p build/shots
	zsh core/qa/gpu-shot.sh 1280x800 $(CURDIR)/build/shots/title.png CB_NOCOACH=1
	zsh scripts/sheets.sh build/shots $(CH)

clean: ## Remove build outputs (sidecar, logs, shots, the tour save). Your own saves and the Godot import stay
	rm -rf $(SIDECAR) build/run.log build/import.log build/shots build/flows build/tour-data

distclean: clean ## clean, and also remove the Godot import cache
	rm -rf godot/.godot
