from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from . import config

T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    def ask(self, schema: type[T], system: str, user: str) -> T: ...


class ChatLLM:
    """Any LangChain chat model, e.g. LLM_MODEL=openai:gpt-4o-mini or ollama:llama3.2."""

    def __init__(self, model: str = config.LLM_MODEL, temperature: float = 0.1):
        from langchain.chat_models import init_chat_model

        self.model = model
        # The provider client retries transient network and rate-limit errors itself.
        self.chat = init_chat_model(model, temperature=temperature, max_retries=5, timeout=90)

    def ask(self, schema: type[T], system: str, user: str) -> T:
        runnable = self.chat.with_structured_output(schema, method="function_calling")
        try:
            return runnable.invoke([("system", system), ("human", user)])
        except ValidationError as e:
            # A reply that does not fit the schema is retried once with the validation error attached.
            fix = f"\n\nYour previous reply was rejected: {str(e).splitlines()[0]}. Fill every required field."
            return runnable.invoke([("system", system), ("human", user + fix)])
