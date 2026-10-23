import random

from rest_framework import serializers

from book_admin.models import FlagCategory

MAX_KEYWORDS = 50


class FlagCategorySerializer(serializers.ModelSerializer):
    """GET / POST / PATCH of a flag category. Reads add `matches` and `awaiting` from context['stats'] ({id: {matches, awaiting}})."""

    keywords = serializers.ListField(child=serializers.CharField(max_length=60, allow_blank=True), max_length=MAX_KEYWORDS)
    matches = serializers.SerializerMethodField()
    awaiting = serializers.SerializerMethodField()

    class Meta:
        model = FlagCategory
        fields = ['id', 'name', 'description', 'keywords', 'mode', 'enabled', 'hue', 'created_at', 'matches', 'awaiting']
        read_only_fields = ['id', 'hue', 'created_at']
        extra_kwargs = {'name': {'validators': [], 'error_messages': {'blank': 'Give the category a name.'}}}

    def _stat(self, category, key):
        return self.context.get('stats', {}).get(category.id, {}).get(key, 0)

    def get_matches(self, category):
        return self._stat(category, 'matches')

    def get_awaiting(self, category):
        return self._stat(category, 'awaiting')

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError('Give the category a name.')
        taken = FlagCategory.objects.filter(name__iexact=name)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError(f'A category called “{name}” already exists.')
        return name

    def validate_keywords(self, value):
        keywords = list(dict.fromkeys(k.strip().lower() for k in value if k.strip()))
        if not keywords:
            raise serializers.ValidationError('Add at least one keyword or subject to match.')
        return keywords

    def create(self, validated_data):
        validated_data.setdefault('hue', random.randrange(360))
        return super().create(validated_data)
