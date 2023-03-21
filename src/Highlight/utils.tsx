import browser, { Tabs } from "webextension-polyfill";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
	StaticCodeLoader,
	NostrCollabLoader,
	createNostrCreateNewRequest,
	NostrRelayUrlResolver,
	NostrRelayTokenProvider,
	MockCollabRelay,
} from "../Nostrcollab";
import { ColorDescription, MessageAction, MessageData, NostrUser, StorageKey } from "../Nostr";
import { IHighlightCollection, IHighlightCollectionAppModel } from "./types";
import { HighlightContainerRuntimeFactory } from "./container";
import { useState } from "react";

export const readLocalStorage = async <T,>(key: StorageKey): Promise<T | undefined> => {
	const storage = await browser.storage.local.get();
	return storage[key];
};

export const writeLocalStorage = async <T,>(key: StorageKey, value: T) => {
	await browser.storage.local.set({ [key]: value });
};

export const sendMessage = <T,>(data: MessageData<T>) => {
	const queryOptions = { active: true, currentWindow: true };

	browser.tabs.query(queryOptions).then((tabs: Tabs.Tab[]) => {
		const currentTab = tabs[0];
		if (currentTab.id !== undefined) {
			browser.tabs.sendMessage(currentTab.id, data).then((response) => {
				if (response.data == "ERR") {
					alert("COLIGHTER ERROR");
				}
			});
		}
	});
};

export const useShowHighlights = () => {
	const [showHighlights, setShowHighlights] = useState(false);

	const toggleShowHighlights = (showHighlights: boolean) => {
		// Update state and local storage
		setShowHighlights(showHighlights);
		writeLocalStorage(StorageKey.SHOW_HIGHLIGHTS, showHighlights);

		// Send message for render action by content script
		sendMessage({
			action: MessageAction.TOGGLE_HIGHLIGHTS,
			data: showHighlights,
		});
	};

	readLocalStorage<boolean>(StorageKey.SHOW_HIGHLIGHTS)
		.then((storedShowHighlights) => {
			// Update state
			let updatedShowHighlights = storedShowHighlights ?? showHighlights;
			setShowHighlights(updatedShowHighlights);

			// Send message for render action by content script
			sendMessage<boolean>({
				action: MessageAction.TOGGLE_HIGHLIGHTS,
				data: updatedShowHighlights,
			});
		})
		.catch((e) => {
			console.log("Failed to read local storage", e);
		});

	return [showHighlights, toggleShowHighlights] as const;
};

export const setupColorUsage = (colorOptions: ColorDescription[]) => {
	let selectedColor: string;

	// Load selected color data from local storage
	browser.storage.local.get().then((store) => {
		selectedColor = store.selected_color || colorOptions[0].val;
		const selectedBtn = document.getElementById(`${selectedColor}`) as HTMLInputElement;

		sendMessage({
			action: MessageAction.SET_COLOR,
			data: { color: selectedColor },
		});

		if (selectedBtn != null) selectedBtn.checked = true;
	});

	const colorButtonGroup = document.getElementById("color-row");
	const colorButtons = document.querySelectorAll('input[name="color"]');

	if (colorButtonGroup != null) {
		colorButtonGroup.addEventListener("click", () => {
			for (const colorButton of colorButtons as any) {
				if (colorButton.checked) {
					const colorSelection = colorButton.getAttribute("value");
					browser.storage.local.set({
						selected_color: colorSelection,
					});
					sendMessage({
						action: MessageAction.SET_COLOR,
						data: { color: colorSelection },
					});
				}
			}
		});
	}
};

export const loadCollabHighlighter = async (user: NostrUser): Promise<IHighlightCollection> => {
	const collabRelayUrl = process.env.COLLAB_RELAY_URL ?? "http://localhost:7070";
	const collabRelay = new MockCollabRelay("wss://mockcollabrelay", 1, collabRelayUrl);

	const tokenProvider = new NostrRelayTokenProvider(collabRelay, user);

	// Create a new Fluid loader, load the highlight collection
	const loader = new NostrCollabLoader<IHighlightCollectionAppModel>({
		urlResolver: new NostrRelayUrlResolver(collabRelay),
		documentServiceFactory: new RouterliciousDocumentServiceFactory(tokenProvider),
		codeLoader: new StaticCodeLoader(new HighlightContainerRuntimeFactory()),
		generateCreateNewRequest: createNostrCreateNewRequest,
	});

	let id: string;
	let highlightsCollection: IHighlightCollectionAppModel;

	if (window.location.hash.length === 0) {
		const createResponse = await loader.createDetached("0.1.0");
		highlightsCollection = createResponse.collab;
		id = await createResponse.attach();
	} else {
		id = window.location.hash.substring(1);
		highlightsCollection = await loader.loadExisting(id);
	}

	// Update the browser url and window title with the container ID
	window.location.hash = id;
	document.title = id;

	return highlightsCollection.highlightCollection;
};