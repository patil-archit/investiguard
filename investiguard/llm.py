from typing import Protocol, TypeVar

from pydantic import BaseModel

from . import config

T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    def ask(self, schema: type[T], system: str, user: str) -> T: ...


class ChatLLM:
    """Any LangChain chat model, e.g. LLM_MODEL=openai:gpt-4o-mini or ollama:llama3.2."""

    def __init__(self, model: str = config.LLM_MODEL, temperature: float = 0.1):
        from langchain.chat_models import init_chat_model

        self.model = model
        self.chat = init_chat_model(model, temperature=temperature)

    def ask(self, schema: type[T], system: str, user: str) -> T:
        runnable = self.chat.with_structured_output(schema, method="function_calling")
        return runnable.invoke([("system", system), ("human", user)])
